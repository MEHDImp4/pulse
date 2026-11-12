import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "discord.js";
import { env } from "../config/env";
import type { PlayerManager } from "../music/PlayerManager";
import { logger } from "../utils/logger";
import { listeningStats } from "../music/ListeningStats";
import {
  canManageGuild, DashboardSessionStore, isValidDashboardAction,
  randomToken, secureEquals, type OAuthGuild, type DashboardSession,
} from "./security";

const API = "https://discord.com/api/v10";
const sessions = new DashboardSessionStore();
const MAX_BODY = 4096;
const MAX_QUERY = 200;

function reply(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function redirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url, "Cache-Control": "no-store" });
  res.end();
}

function cookieId(req: IncomingMessage): string {
  const match = (req.headers.cookie ?? "").match(/(?:^|;\s*)pulse_session=([A-Za-z0-9_-]+)/);
  return match?.[1] ?? "";
}

function cookieHeader(id: string, secure: boolean): string {
  return `pulse_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${secure ? "; Secure" : ""}`;
}

async function discordGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function exchangeCode(code: string, redirectUri: string): Promise<{
  access_token: string; expires_in: number;
}> {
  const body = new URLSearchParams({
    client_id: env.discordClientId,
    client_secret: env.dashboardClientSecret!,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Discord OAuth HTTP ${response.status}`);
  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function guildsFor(session: DashboardSession, client: Client): Promise<OAuthGuild[]> {
  const list = await discordGet<OAuthGuild[]>("/users/@me/guilds", session.accessToken!);
  return list.filter((g) => canManageGuild(g) && client.guilds.cache.has(g.id));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY) throw new Error("Payload too large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sessionFor(req: IncomingMessage): DashboardSession | undefined {
  const session = sessions.get(cookieId(req));
  return session?.accessToken && session.userId && session.expiresAt && session.expiresAt > Date.now()
    ? session : undefined;
}

function staticFile(res: ServerResponse, file: "index.html" | "app.js" | "styles.css"): void {
  const path = join(process.cwd(), "dashboard", file);
  const body = readFileSync(path);
  const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript";
  res.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(body);
}

/**
 * Same-origin, OAuth2-protected admin dashboard. No bot token or client secret
 * is sent to browsers. Every guild action re-checks OAuth membership and
 * ManageGuild; there is no cross-server information in public endpoints.
 */
export function startDashboard(players: PlayerManager, client: Client): Server | undefined {
  if (!env.dashboardPort) return undefined;
  if (!env.dashboardClientSecret || !env.dashboardPublicUrl) {
    throw new Error("DASHBOARD_CLIENT_SECRET and DASHBOARD_PUBLIC_URL required");
  }
  const origin = new URL(env.dashboardPublicUrl);
  if (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) {
    throw new Error("Dashboard public URL must use HTTPS outside localhost");
  }
  const secureCookie = origin.protocol === "https:";
  const redirectUri = new URL("/oauth/callback", origin).toString();

  const server = createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' https://cdn.discordapp.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (secureCookie) res.setHeader("Strict-Transport-Security", "max-age=31536000");

    void (async () => {
      const url = new URL(req.url ?? "/", origin);
      const path = url.pathname;
      if (req.method === "GET" && ["/", "/app.js", "/styles.css"].includes(path)) {
        staticFile(res, path === "/" ? "index.html" : path.substring(1) as "app.js" | "styles.css");
        return;
      }
      if (req.method === "GET" && path === "/login") {
        const { id, session } = sessions.create();
        const oauthUrl = new URL("https://discord.com/oauth2/authorize");
        oauthUrl.search = new URLSearchParams({
          client_id: env.discordClientId,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "identify guilds",
          state: session.oauthState,
          prompt: "consent",
        }).toString();
        res.setHeader("Set-Cookie", cookieHeader(id, secureCookie));
        redirect(res, oauthUrl.toString());
        return;
      }
      if (req.method === "GET" && path === "/oauth/callback") {
        const session = sessions.get(cookieId(req));
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        if (!session || !code || !secureEquals(session.oauthState, state) || session.accessToken) {
          reply(res, 403, { error: "OAuth state invalide ou expiré" });
          return;
        }
        // Single-use CSRF state, even when token exchange fails.
        session.oauthState = randomToken();
        const token = await exchangeCode(code, redirectUri);
        const user = await discordGet<{ id: string; username: string }>("/users/@me", token.access_token);
        session.accessToken = token.access_token;
        session.userId = user.id;
        session.username = user.username;
        session.expiresAt = Date.now() + Math.min(3600, token.expires_in) * 1000;
        session.csrfToken = randomToken();
        redirect(res, "/");
        return;
      }
      if (req.method === "POST" && path === "/logout") {
        const session = sessionFor(req);
        if (!session || !secureEquals(session.csrfToken ?? "", String(req.headers["x-csrf-token"] ?? ""))) {
          reply(res, 403, { error: "Accès refusé" }); return;
        }
        sessions.revoke(cookieId(req));
        res.setHeader("Set-Cookie", "pulse_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
        reply(res, 200, { ok: true });
        return;
      }
      if (!path.startsWith("/api/")) {
        reply(res, 404, { error: "Not found" }); return;
      }
      const session = sessionFor(req);
      if (!session) { reply(res, 401, { error: "Connexion requise" }); return; }
      if (req.method === "GET" && path === "/api/me") {
        reply(res, 200, { id: session.userId, username: session.username, csrf: session.csrfToken }); return;
      }
      if (req.method === "GET" && path === "/api/guilds") {
        reply(res, 200, await guildsFor(session, client)); return;
      }
      const match = path.match(/^\/api\/guilds\/(\d{5,22})(?:\/(action))?$/);
      if (!match) { reply(res, 404, { error: "Route inconnue" }); return; }
      const guildId = match[1];
      const guilds = await guildsFor(session, client);
      if (!guilds.some((g) => g.id === guildId)) {
        reply(res, 403, { error: "Gérer le serveur est nécessaire pour ce bot" }); return;
      }
      const player = players.getForGuild(guildId).find((p) => p.isConnected);
      if (req.method === "GET" && !match[2]) {
        reply(res, 200, {
          guildId,
          player: player ? {
            channelId: player.channelId,
            state: player.state,
            current: player.currentTrack ? { title: player.currentTrack.title, author: player.currentTrack.author, duration: player.currentTrack.duration } : null,
            queue: player.queue.snapshot().map((t) => ({ title: t.title, author: t.author, requester: t.requestedBy.username })),
            volume: player.volume, loopMode: player.loopMode, autoplay: player.autoplay,
            filter: player.filter,
          } : null,
          uptimeSeconds: Math.floor(process.uptime()),
          listening: listeningStats.get(guildId),
        });
        return;
      }
      if (req.method !== "POST" || match[2] !== "action") {
        reply(res, 405, { error: "Method not allowed" }); return;
      }
      if (!secureEquals(session.csrfToken ?? "", String(req.headers["x-csrf-token"] ?? ""))) {
        reply(res, 403, { error: "CSRF token invalide" }); return;
      }
      const requestOrigin = req.headers.origin;
      if (requestOrigin && requestOrigin !== origin.origin) {
        reply(res, 403, { error: "Origine non autorisée" }); return;
      }
      const payload = await readJson(req);
      if (!isValidDashboardAction(payload)) {
        reply(res, 400, { error: "Action invalide" }); return;
      }
      if (!player) { reply(res, 409, { error: "Pas de musique en cours sur ce serveur" }); return; }

      const action = payload.action;
      if (session.lastActionAt && Date.now() - session.lastActionAt < 700) {
        reply(res, 429, { error: "Trop de commandes : réessaie dans un instant" }); return;
      }
      session.lastActionAt = Date.now();
      switch (action) {
        case "pause": await player.pause(); break;
        case "resume": await player.resume(); break;
        case "skip": await player.skip(); break;
        case "stop": await player.stop(); break;
        case "volume":
          if (!Number.isInteger(payload.value) || payload.value! < 0 || payload.value! > 100) {
            reply(res, 400, { error: "Volume entre 0 et 100 requis" }); return;
          }
          player.volume = payload.value!;
          break;
        case "remove":
          if (!Number.isInteger(payload.value) || payload.value! < 0 ||
             !player.queue.removeAt(payload.value!)) {
            reply(res, 400, { error: "Position de morceau invalide" }); return;
          }
          player.notifyQueueChange();
          break;
        case "move":
          if (!Number.isInteger(payload.value) || !Number.isInteger(payload.target) ||
             !player.queue.move(payload.value!, payload.target!)) {
            reply(res, 400, { error: "Déplacement invalide" }); return;
          }
          player.notifyQueueChange();
          break;
        case "add":
          if (!payload.query || typeof payload.query !== "string" || payload.query.length > MAX_QUERY) {
            reply(res, 400, { error: "Recherche musicale invalide" }); return;
          }
          {
            const track = await players.resolveTrack(payload.query, {
              id: session.userId!, username: session.username ?? "Dashboard",
            });
            if (!player.isConnected || !players.getForGuild(guildId).includes(player)) {
              reply(res, 409, { error: "Le lecteur a changé pendant la recherche" }); return;
            }
            await player.add(track);
          }
          break;
        case "fairqueue":
          player.queue.fairQueue();
          player.notifyQueueChange();
          break;
        case "clear":
          player.queue.clear();
          player.notifyQueueChange();
          break;
        default: reply(res, 400, { error: "Action non supportée" }); return;
      }
      reply(res, 200, { ok: true });
    })().catch((error) => {
      logger.warn({ err: error }, "Dashboard request failed");
      if (!res.headersSent) reply(res, 500, { error: "Requête impossible" });
      else res.end();
    });
  });

  server.listen(env.dashboardPort, env.dashboardBind, () => {
    logger.info({ port: env.dashboardPort, bind: env.dashboardBind }, "OAuth2 dashboard listening");
  });
  server.on("error", (error) => logger.error({ err: error }, "Dashboard listener error"));
  return server;
}
