import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { GuildMember, type APIInteractionGuildMember } from "discord.js";
import { env } from "../config/env";

export function memberRoleIds(member: GuildMember | APIInteractionGuildMember | null): string[] {
  if (!member) return [];
  return member instanceof GuildMember
    ? [...member.roles.cache.keys()]
    : Array.isArray(member.roles) ? member.roles : [];
}

/** Persistent, per-guild DJ role allowlist, controlled by ManageGuild only. */
export class DjRoleStore {
  private readonly data = new Map<string, string[]>();

  constructor(private readonly path: string) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object" && "guilds" in parsed) {
        const guilds = (parsed as { guilds?: unknown }).guilds;
        if (guilds && typeof guilds === "object") {
          for (const [gid, raw] of Object.entries(guilds)) {
            if (Array.isArray(raw)) {
              this.data.set(gid, raw.filter((v) => typeof v === "string" && /^\d{5,22}$/.test(v)).slice(0, 10));
            }
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Unable to read DJ roles configuration; refusing to overwrite it");
      }
    }
  }

  getRoles(guildId: string | null): string[] {
    return guildId ? [...(this.data.get(guildId) ?? [])] : [];
  }

  addRole(guildId: string, roleId: string): boolean {
    if (!/^\d{5,22}$/.test(roleId)) throw new Error("Invalid Discord role");
    const current = this.data.get(guildId) ?? [];
    if (current.includes(roleId)) return false;
    if (current.length >= 10) throw new Error("Maximum 10 rôles DJ.");
    this.data.set(guildId, [...current, roleId]);
    this.save();
    return true;
  }

  removeRole(guildId: string, roleId: string): boolean {
    const current = this.data.get(guildId) ?? [];
    if (!current.includes(roleId)) return false;
    this.data.set(guildId, current.filter((id) => id !== roleId));
    this.save();
    return true;
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, guilds: Object.fromEntries(this.data) }), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
}

export const djRoleStore = new DjRoleStore(join(env.dataDir, "dj-roles.json"));
