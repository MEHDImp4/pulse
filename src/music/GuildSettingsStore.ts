import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isFilterPreset, type FilterPreset } from "../audio/filters";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import type { LoopMode } from "./GuildPlayer";

export interface GuildSettings {
  volume: number;
  loopMode: LoopMode;
  autoplay: boolean;
  filter: FilterPreset;
}

export const DEFAULT_GUILD_SETTINGS: GuildSettings = {
  volume: 100,
  loopMode: "off",
  autoplay: env.autoplayDefault,
  filter: "off",
};

export const LOOP_MODES: readonly LoopMode[] = ["off", "track", "queue"];

export function sanitizeSettings(input: unknown): GuildSettings {
  const raw = (input ?? {}) as Partial<GuildSettings>;

  const volume =
    typeof raw.volume === "number" && Number.isFinite(raw.volume)
      ? Math.max(0, Math.min(100, Math.round(raw.volume)))
      : DEFAULT_GUILD_SETTINGS.volume;

  const loopMode = LOOP_MODES.includes(raw.loopMode as LoopMode)
    ? (raw.loopMode as LoopMode)
    : DEFAULT_GUILD_SETTINGS.loopMode;

  const autoplay =
    typeof raw.autoplay === "boolean" ? raw.autoplay : DEFAULT_GUILD_SETTINGS.autoplay;

  const filter = isFilterPreset(raw.filter) ? raw.filter : DEFAULT_GUILD_SETTINGS.filter;

  return { volume, loopMode, autoplay, filter };
}

export function mergeSettings(base: GuildSettings, patch: Partial<GuildSettings>): GuildSettings {
  return sanitizeSettings({ ...base, ...patch });
}

interface PersistedSettings {
  version: 2;
  guilds: Record<string, GuildSettings>;
  sessions: Record<string, GuildSettings>;
}

/**
 * Persists per-guild defaults plus per-session (guild + voice channel)
 * overrides. Migrates the legacy v1 format (flat map keyed by guild id) into
 * the guild defaults map.
 */
export class GuildSettingsStore {
  private readonly guilds = new Map<string, GuildSettings>();
  private readonly sessions = new Map<string, GuildSettings>();
  private saveTimer?: NodeJS.Timeout;

  constructor(
    private readonly filePath: string,
    private readonly debounceMs = 500,
  ) {}

  load(): void {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      this.guilds.clear();
      this.sessions.clear();

      if (parsed && parsed.version === 2) {
        const guilds = (parsed.guilds ?? {}) as Record<string, unknown>;
        const sessions = (parsed.sessions ?? {}) as Record<string, unknown>;
        for (const [guildId, value] of Object.entries(guilds)) {
          this.guilds.set(guildId, sanitizeSettings(value));
        }
        for (const [sessionId, value] of Object.entries(sessions)) {
          this.sessions.set(sessionId, sanitizeSettings(value));
        }
      } else if (parsed && parsed.version !== undefined) {
        logger.warn({ version: parsed.version, file: this.filePath }, "Unsupported guild settings version, using defaults");
      } else {
        // Legacy v1: every top-level key is a guild id.
        for (const [guildId, value] of Object.entries(parsed)) {
          this.guilds.set(guildId, sanitizeSettings(value));
        }
        logger.info({ guilds: this.guilds.size }, "Migrated legacy v1 guild settings");
      }

      logger.info(
        { guilds: this.guilds.size, sessions: this.sessions.size, file: this.filePath },
        "Guild settings loaded",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.info({ file: this.filePath }, "No guild settings file yet, starting fresh");
      } else {
        logger.warn({ err: error, file: this.filePath }, "Failed to load guild settings, using defaults");
      }
    }
  }

  get(sessionId: string, guildId: string): GuildSettings {
    return (
      this.sessions.get(sessionId) ??
      this.guilds.get(guildId) ??
      { ...DEFAULT_GUILD_SETTINGS }
    );
  }

  getGuildDefaults(guildId: string): GuildSettings {
    return this.guilds.get(guildId) ?? { ...DEFAULT_GUILD_SETTINGS };
  }

  update(sessionId: string, guildId: string, patch: Partial<GuildSettings>): GuildSettings {
    // Only the session is mutated: writing back to guild defaults would leak
    // one channel's volume/filter into every other channel of the guild.
    const next = mergeSettings(this.get(sessionId, guildId), patch);
    this.sessions.set(sessionId, next);
    this.scheduleSave();
    return next;
  }

  /** Moves a session's overrides to a new id (used when the bot is moved). */
  moveSession(from: string, to: string): void {
    const existing = this.sessions.get(from);
    if (!existing) return;
    this.sessions.delete(from);
    this.sessions.set(to, existing);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.save();
    }, this.debounceMs);
  }

  /** Persists immediately (atomic write). */
  save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const payload: PersistedSettings = {
        version: 2,
        guilds: Object.fromEntries(this.guilds),
        sessions: Object.fromEntries(this.sessions),
      };
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
      renameSync(tmp, this.filePath);
    } catch (error) {
      try {
        unlinkSync(`${this.filePath}.tmp`);
      } catch {
        // Nothing to clean up.
      }
      logger.warn({ err: error, file: this.filePath }, "Failed to save guild settings");
    }
  }

  /** Cancels a pending debounced save and writes now. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    this.save();
  }
}
