import { randomBytes, timingSafeEqual } from "node:crypto";
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
