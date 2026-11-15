import { createServer as createTcpServer } from "node:net";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Collection, type Client } from "discord.js";

const mockEnv = vi.hoisted(() => ({
  logLevel: "info",
  dashboardPort: 0,
  dashboardAuthMode: "local" as "local" | "discord",
  dashboardPassword: "very-strong-local-secret",
  dashboardBind: "127.0.0.1",
  dashboardPublicUrl: undefined as string | undefined,
  dashboardClientSecret: undefined as string | undefined,
  discordClientId: "123456789012345678",
}));
vi.mock("../src/config/env", () => ({ env: mockEnv }));

import { startDashboard } from "../src/dashboard/server";
import type { Server } from "node:http";
import type { PlayerManager } from "../src/music/PlayerManager";

describe("Unraid local dashboard HTTP", () => {
  let server: Server;
  let baseUrl: string;
  const guildId = "123456789012345678";

  beforeAll(async () => {
    // Reserve an OS-chosen port instead of hardcoding one across CI runners.
    const probe = createTcpServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("No local port");
    mockEnv.dashboardPort = address.port;
    await new Promise<void>((resolve, reject) => probe.close((err) => err ? reject(err) : resolve()));

    const guilds = new Collection([[guildId, { id: guildId, name: "Server Test" }]]);
    const client = { guilds: { cache: guilds } } as unknown as Client;
    const players = {
      getForGuild: () => [],
      cacheForGuild: () => undefined,
    } as unknown as PlayerManager;
    const started = startDashboard(players, client);
    if (!started) throw new Error("Local dashboard failed to start");
    server = started;
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${mockEnv.dashboardPort}`;
  });

  afterAll(async () => {
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("exposes login mode but not the guild list without authentication", async () => {
    const cfg = await fetch(baseUrl + "/api/config");
    expect(cfg.status).toBe(200);
    expect(await cfg.json()).toEqual({ authMode: "local" });

    const privateResult = await fetch(baseUrl + "/api/guilds");
    expect(privateResult.status).toBe(401);
  });

  it("rejects invalid password and cross-site local login", async () => {
    const cross = await fetch(baseUrl + "/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://evil.invalid" },
      body: JSON.stringify({ password: mockEnv.dashboardPassword }),
    });
    expect(cross.status).toBe(403);
    const invalid = await fetch(baseUrl + "/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ password: "incorrect-password" }),
    });
    expect(invalid.status).toBe(401);
  });

  it("logs in on a LAN IP and enforces cookie + CSRF for admin endpoints", async () => {
    const response = await fetch(baseUrl + "/local/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ password: mockEnv.dashboardPassword }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toMatch(/^pulse_session=/);

    const me = await fetch(baseUrl + "/api/me", { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    const user = await me.json() as { csrf: string; username: string };
    expect(user.username).toBe("Administrateur local");
    expect(user.csrf).toBeTruthy();

    const guilds = await fetch(baseUrl + "/api/guilds", { headers: { Cookie: cookie } });
    expect(guilds.status).toBe(200);
    expect((await guilds.json() as Array<{ id: string }>)[0].id).toBe(guildId);

    const unauthorized = await fetch(baseUrl + `/api/guilds/${guildId}/action`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json", Origin: baseUrl },
      body: JSON.stringify({ action: "pause" }),
    });
    expect(unauthorized.status).toBe(403);

    const crossSite = await fetch(baseUrl + `/api/guilds/${guildId}/action`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json",
        Origin: "http://evil.invalid", "x-csrf-token": user.csrf },
      body: JSON.stringify({ action: "pause" }),
    });
    expect(crossSite.status).toBe(403);

    const allowed = await fetch(baseUrl + `/api/guilds/${guildId}/action`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json",
        Origin: baseUrl, "x-csrf-token": user.csrf },
      body: JSON.stringify({ action: "pause" }),
    });
    expect(allowed.status).toBe(409); // authenticated; no voice player is active
  });
});
