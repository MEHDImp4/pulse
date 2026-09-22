import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { parseHttpUrl } from "../utils/net";
import { isTrackProvider, type RequestedBy, type Track } from "./Track";

const MAX_PERSISTED_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

export interface PersistedQueue {
  guildId: string;
  channelId: string;
  /** Last text channel used for the now-playing card, so it can be reposted on resume. */
  textChannelId?: string;
  current?: Track;
  tracks: Track[];
  savedAt: number;
}

interface PersistedFile {
  version: 1;
  sessions: Record<string, PersistedQueue>;
}

function sanitizeTrack(value: unknown): Track | undefined {
  const track = (value ?? {}) as Partial<Track>;
  if (typeof track.id !== "string" || typeof track.title !== "string" || typeof track.webpageUrl !== "string") {
    return undefined;
  }
  if (!parseHttpUrl(track.webpageUrl)) return undefined;

  const requestedBy = track.requestedBy as Partial<RequestedBy> | undefined;
  if (!requestedBy || typeof requestedBy.id !== "string" || typeof requestedBy.username !== "string") {
    return undefined;
  }

  return {
    id: track.id,
    title: track.title,
    webpageUrl: track.webpageUrl,
    thumbnail: typeof track.thumbnail === "string" ? track.thumbnail : undefined,
    duration: typeof track.duration === "number" ? track.duration : undefined,
    author: typeof track.author === "string" ? track.author : undefined,
    requestedBy: { id: requestedBy.id, username: requestedBy.username },
    provider: isTrackProvider(track.provider) ? track.provider : "youtube",
    isLive: track.isLive === true ? true : undefined,
  };
}

export function sanitizePersistedQueue(value: unknown): PersistedQueue | undefined {
  const raw = (value ?? {}) as Partial<PersistedQueue>;
  if (typeof raw.guildId !== "string" || typeof raw.channelId !== "string") return undefined;

  const tracks = Array.isArray(raw.tracks)
    ? raw.tracks
        .slice(0, env.maxQueueSize)
        .map(sanitizeTrack)
        .filter((track): track is Track => track !== undefined)
    : [];

  return {
    guildId: raw.guildId,
    channelId: raw.channelId,
    textChannelId: typeof raw.textChannelId === "string" ? raw.textChannelId : undefined,
    current: raw.current ? sanitizeTrack(raw.current) : undefined,
    tracks,
    savedAt: typeof raw.savedAt === "number" ? raw.savedAt : Date.now(),
  };
}

/** Persists per-session queues so playback can resume after a restart. */
export class QueueStore {
  private readonly sessions = new Map<string, PersistedQueue>();
  private saveTimer?: NodeJS.Timeout;

  constructor(
    private readonly filePath: string,
    private readonly debounceMs = 1_000,
  ) {}

  load(): void {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedFile>;
      const sessions = parsed.sessions ?? {};
      const cutoff = Date.now() - MAX_PERSISTED_AGE_MS;
      this.sessions.clear();
      for (const [sessionId, value] of Object.entries(sessions)) {
        const sanitized = sanitizePersistedQueue(value);
        if (sanitized && sanitized.savedAt >= cutoff) this.sessions.set(sessionId, sanitized);
      }
      logger.info({ sessions: this.sessions.size, file: this.filePath }, "Persisted queues loaded");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        logger.info({ file: this.filePath }, "No persisted queues yet, starting fresh");
      } else {
        logger.warn({ err: error, file: this.filePath }, "Failed to load persisted queues");
      }
    }
  }

  get(sessionId: string): PersistedQueue | undefined {
    return this.sessions.get(sessionId);
  }

  /** Snapshot of every persisted session (copy), safe to iterate while deleting. */
  entries(): [string, PersistedQueue][] {
    return [...this.sessions.entries()];
  }

  set(sessionId: string, entry: Omit<PersistedQueue, "savedAt">): void {
    this.sessions.set(sessionId, { ...entry, savedAt: Date.now() });
    this.scheduleSave();
  }

  delete(sessionId: string): void {
    if (this.sessions.delete(sessionId)) this.scheduleSave();
  }

  /** Moves a persisted session to a new id (used when the bot is moved). */
  move(from: string, to: string, channelId: string): void {
    const entry = this.sessions.get(from);
    if (!entry) return;
    this.sessions.delete(from);
    this.sessions.set(to, { ...entry, channelId, savedAt: Date.now() });
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
      const payload: PersistedFile = {
        version: 1,
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
      logger.warn({ err: error, file: this.filePath }, "Failed to save persisted queues");
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
