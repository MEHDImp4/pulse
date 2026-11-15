import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { PermissionFlagsBits } from "discord.js";

export interface OAuthGuild {
  id: string;
  name: string;
  permissions: string;
  owner?: boolean;
}

/** Dashboard access is limited to admins and Manage Server members. */
export function canManageGuild(guild: OAuthGuild): boolean {
  try {
    const bits = BigInt(guild.permissions);
    return guild.owner === true ||
      (bits & PermissionFlagsBits.Administrator) !== 0n ||
      (bits & PermissionFlagsBits.ManageGuild) !== 0n;
  } catch { return false; }
}

export function secureEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface DashboardSession {
  oauthState: string;
  createdAt: number;
  userId?: string;
  username?: string;
  accessToken?: string;
  localAuthenticated?: boolean;
  expiresAt?: number;
  csrfToken?: string;
  lastActionAt?: number;
}

export class DashboardSessionStore {
  private readonly sessions = new Map<string, DashboardSession>();
  constructor(private readonly now: () => number = Date.now, private readonly maxEntries = 1000) {}

  create(): { id: string; session: DashboardSession } {
    this.cleanup();
    while (this.sessions.size >= this.maxEntries) {
      const oldest = this.sessions.keys().next().value;
      if (!oldest) break;
      this.sessions.delete(oldest);
    }
    const id = randomToken();
    const session = { createdAt: this.now(), oauthState: randomToken() };
    this.sessions.set(id, session);
    return { id, session };
  }

  get(id: string): DashboardSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.now() - session.createdAt > 24 * 60 * 60_000 ||
       (session.expiresAt !== undefined && session.expiresAt <= this.now())) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  revoke(id: string): void { this.sessions.delete(id); }
  cleanup(): void {
    for (const [key] of this.sessions) this.get(key);
  }
}

export function isValidDashboardAction(input: unknown): input is {
  action: string; value?: number; target?: number; query?: string;
} {
  return !!input && typeof input === "object" &&
    typeof (input as {action?: unknown}).action === "string" &&
    (input as {action: string}).action.length <= 32;
}

/**
 * Local-dashboard password verification is intentionally separate from Discord
 * OAuth. Never store plaintext credentials in sessions or serve them to clients.
 * Per-socket-address failures are capped to protect the LAN login endpoint.
 */
export class LocalDashboardAuth {
  private readonly salt = randomBytes(16);
  private readonly digest: Buffer;
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(password: string, private readonly now: () => number = Date.now) {
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 256) {
      throw new Error("DASHBOARD_PASSWORD must contain 12 to 256 bytes");
    }
    this.digest = scryptSync(password, this.salt, 64);
  }

  check(password: unknown, remoteAddress: string | undefined): "ok" | "denied" | "limited" {
    const client = remoteAddress || "unknown";
    const now = this.now();
    const previous = this.failures.get(client);
    const current = previous && previous.until > now ? previous : { count: 0, until: now + 10 * 60_000 };
    if (current.count >= 5) return "limited";

    // Always hash a bounded input, including invalid submissions.
    const attempt = typeof password === "string" && Buffer.byteLength(password, "utf8") <= 256
      ? password : "";
    const digest = scryptSync(attempt, this.salt, 64);
    if (timingSafeEqual(digest, this.digest)) {
      this.failures.delete(client);
      return "ok";
    }
    current.count++;
    this.failures.set(client, current);
    // Bound distinct clients so attempts cannot grow the process heap forever.
    if (this.failures.size > 512) {
      const oldest = this.failures.keys().next().value;
      if (oldest) this.failures.delete(oldest);
    }
    return "denied";
  }
}

/**
 * LAN mode must not accept Host: attacker.example.com (DNS rebinding).
 * Use http://<unraid-private-IP>:<mapped-port>, including Tailscale CGNAT IPs.
 */
export function isLocalDashboardHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  let name: string;
  try {
    const url = new URL("http://" + hostHeader);
    if (url.pathname !== "/" || url.username || url.password || url.search || url.hash) return false;
    name = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (name === "localhost" || name === "::1") return true;
  if (isIP(name) === 6) return /^(?:fc|fd|fe8|fe9|fea|feb)/.test(name);
  if (isIP(name) !== 4) return false;
  const [a, b] = name.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127);
}
