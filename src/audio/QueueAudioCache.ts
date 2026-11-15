import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { type ChildProcess } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AudioProvider } from "../providers/AudioProvider";
import type { Track } from "../music/Track";
import { logger } from "../utils/logger";

interface CacheEntry {
  path: string;
  bytes: number;
  touched: number;
}

export interface GuildCacheSnapshot {
  queued: number;
  ready: number;
  downloading: number;
  pending: number;
  failed: number;
}

export interface GlobalCacheSnapshot {
  files: number;
  bytes: number;
  maxBytes: number;
  activeDownloads: number;
}

export interface QueueAudioCacheOptions {
  maxBytes: number;
  maxTrackBytes: number;
  concurrency: number;
  downloadTimeoutMs?: number;
}

/**
 * Global, bounded cache of compressed audio for entire guild queues.
 *
 * Downloads occur through the same allowlisted AudioProvider used for playback
 * (never arbitrary direct URLs). Only completed files are published. The cache
 * survives restarts under DATA_DIR; partial files do not. This cache does not
 * run FFmpeg or decode every song: one normal standby Opus pipeline remains in
 * charge of the immediate next transition.
 */
export class QueueAudioCache {
  private readonly desired = new Map<string, readonly Track[]>();
  private readonly ready = new Map<string, CacheEntry>();
  private readonly active = new Map<string, AbortController>();
  private readonly failures = new Map<string, number>();
  private readonly maxBytes: number;
  private readonly maxTrackBytes: number;
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly initialized: Promise<void>;
  private totalBytes = 0;
  private closed = false;
  private requestedPump = false;

  constructor(
    private readonly provider: AudioProvider,
    private readonly directory: string,
    options: QueueAudioCacheOptions,
  ) {
    this.maxBytes = Math.max(0, Math.floor(options.maxBytes));
    this.maxTrackBytes = Math.max(1, Math.min(this.maxBytes, Math.floor(options.maxTrackBytes)));
    this.concurrency = Math.max(1, Math.floor(options.concurrency));
    this.timeoutMs = Math.max(1_000, options.downloadTimeoutMs ?? 120_000);
    this.initialized = this.initialize().catch((error) => {
      logger.warn({ err: error }, "Audio queue cache unavailable");
      this.closed = true;
    });
  }

  /** Small snapshots: never include filenames, URLs or other servers' queue data. */
  globalSnapshot(): GlobalCacheSnapshot {
    return {
      files: this.ready.size,
      bytes: this.totalBytes,
      maxBytes: this.maxBytes,
      activeDownloads: this.active.size,
    };
  }

  guildSnapshot(guildId: string): GuildCacheSnapshot {
    const queue = this.desired.get(guildId) ?? [];
    const summary: GuildCacheSnapshot = {
      queued: queue.length, ready: 0, downloading: 0, pending: 0, failed: 0,
    };
    const now = Date.now();
    for (const track of queue) {
      const key = QueueAudioCache.key(track);
      if (this.ready.has(key)) summary.ready++;
      else if (this.active.has(key)) summary.downloading++;
      else if ((this.failures.get(key) ?? 0) > now) summary.failed++;
      else summary.pending++;
    }
    return summary;
  }

  /** Identical songs across guilds share one cached file and one download. */
  static key(track: Track): string {
    return createHash("sha256").update(track.provider).update("\0").update(track.webpageUrl).digest("hex");
  }

  private eligible(track: Track): boolean {
    return !track.isLive && (track.provider === "youtube" || track.provider === "soundcloud") &&
      /^https:\/\//i.test(track.webpageUrl);
  }

  /** Called on queue changes, including reorder, remove, skip and stop. */
  setQueue(guildId: string, tracks: readonly Track[]): void {
    if (this.closed || this.maxBytes === 0) return;
    this.desired.set(guildId, tracks.filter((track) => this.eligible(track)));

    const wanted = new Set(this.allWanted().map((track) => QueueAudioCache.key(track)));
    for (const [key, abort] of this.active) {
      if (!wanted.has(key)) abort.abort();
    }
    for (const key of this.failures.keys()) {
      if (!wanted.has(key)) this.failures.delete(key);
    }
    this.pump();
  }

  forgetGuild(guildId: string): void {
    this.desired.delete(guildId);
    const wanted = new Set(this.allWanted().map((track) => QueueAudioCache.key(track)));
    for (const [key, abort] of this.active) {
      if (!wanted.has(key)) abort.abort();
    }
  }

  /** No on-demand downloading: playback must never block waiting for the cache. */
  async pathFor(track: Track): Promise<string | undefined> {
    if (this.closed || !this.eligible(track)) return undefined;
    await this.initialized;
    const key = QueueAudioCache.key(track);
    const entry = this.ready.get(key);
    if (!entry) return undefined;
    try {
      const current = await stat(entry.path);
      if (!current.isFile() || current.size !== entry.bytes || !current.size) throw new Error("Stale cached audio");
      entry.touched = Date.now();
      return entry.path;
    } catch {
      this.ready.delete(key);
      this.totalBytes -= entry.bytes;
      this.pump();
      return undefined;
    }
  }

  /** Remove a cached file that FFmpeg could not decode; next attempt streams live. */
  invalidate(track: Track): void {
    const key = QueueAudioCache.key(track);
    const entry = this.ready.get(key);
    if (!entry) return;
    this.ready.delete(key);
    this.totalBytes -= entry.bytes;
    this.failures.set(key, Date.now() + 5 * 60_000);
    void rm(entry.path, { force: true }).catch(() => undefined);
  }

  close(): void {
    this.closed = true;
    this.desired.clear();
    for (const controller of this.active.values()) controller.abort();
  }

  /** Interleave guild queues by position to prioritize everybody's next songs. */
  private allWanted(): Track[] {
    const queues = [...this.desired.values()];
    const ordered: Track[] = [];
    const seen = new Set<string>();
    const longest = Math.max(0, ...queues.map((queue) => queue.length));
    for (let position = 0; position < longest; position++) {
      for (const queue of queues) {
        const track = queue[position];
        if (!track) continue;
        const key = QueueAudioCache.key(track);
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(track);
      }
    }
    return ordered;
  }

  private pump(): void {
    if (this.requestedPump || this.closed || this.maxBytes === 0) return;
    this.requestedPump = true;
    void this.initialized.then(() => {
      this.requestedPump = false;
      if (this.closed) return;
      const now = Date.now();
      for (const track of this.allWanted()) {
        if (this.active.size >= this.concurrency) break;
        const key = QueueAudioCache.key(track);
        if (this.ready.has(key) || this.active.has(key)) continue;
        if ((this.failures.get(key) ?? 0) > now) continue;
        const controller = new AbortController();
        this.active.set(key, controller);
        void this.download(track, key, controller.signal)
          .catch((error) => {
            if (!controller.signal.aborted) {
              logger.debug({ err: error, provider: track.provider }, "Queue audio prefetch failed; using live stream");
              this.failures.set(key, Date.now() + 10 * 60_000);
            }
          })
          .finally(() => {
            this.active.delete(key);
            this.pump();
          });
      }
    }).catch((error) => logger.warn({ err: error }, "Queue cache initialization failed"));
  }

  private async initialize(): Promise<void> {
    if (this.maxBytes === 0) return;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const files = await readdir(this.directory, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile()) continue;
      const path = join(this.directory, file.name);
      if (!/^[a-f0-9]{64}\.audio$/.test(file.name)) {
        if (file.name.endsWith(".part")) await rm(path, { force: true }).catch(() => undefined);
        continue;
      }
      const info = await stat(path);
      if (info.size === 0 || info.size > this.maxTrackBytes) {
        await rm(path, { force: true }).catch(() => undefined);
        continue;
      }
      this.ready.set(file.name.slice(0, 64), {
        path, bytes: info.size, touched: info.mtimeMs,
      });
      this.totalBytes += info.size;
    }
    await this.trim();
  }

  private async download(track: Track, key: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted || this.closed) return;
    const temporary = join(this.directory, key + "." + randomUUID() + ".part");
    const output = join(this.directory, key + ".audio");
    let sourceProcess: ChildProcess | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let bytes = 0;
    const controller = new AbortController();
    const onCancel = (): void => controller.abort();
    signal.addEventListener("abort", onCancel, { once: true });
    if (signal.aborted) controller.abort();
    try {
      timer = setTimeout(() => controller.abort(), this.timeoutMs);

      // Providers may spend seconds resolving a source. Abort the job on
      // queue changes/timeouts without occupying a download worker forever.
      // If a provider resolves *after* cancellation, terminate its process
      // so the orphaned download never keeps running in the background.
      const sourcePromise = this.provider.createSource(track);
      let adopted = false;
      void sourcePromise.then((lateSource) => {
        if (!adopted && controller.signal.aborted) {
          if (lateSource.kind === "pipe" && lateSource.process.exitCode === null) {
            lateSource.process.kill("SIGTERM");
          } else if (lateSource.kind === "stream") {
            lateSource.close();
          }
        }
      }).catch(() => undefined);

      let rejectLookup!: (reason: Error) => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        rejectLookup = reject;
      });
      const cancelLookup = (): void => rejectLookup(new Error("Audio source preparation cancelled"));
      controller.signal.addEventListener("abort", cancelLookup, { once: true });
      if (controller.signal.aborted) cancelLookup();
      let source: Awaited<ReturnType<AudioProvider["createSource"]>>;
      try {
        source = await Promise.race([sourcePromise, cancelled]);
        adopted = true;
      } finally {
        controller.signal.removeEventListener("abort", cancelLookup);
      }
      if (source.kind !== "pipe") {
        if (source.kind === "stream") source.close();
        throw new Error("Cache supports downloaded audio streams only");
      }
      sourceProcess = source.process;
      const onAbort = (): void => {
        if (sourceProcess && sourceProcess.exitCode === null) sourceProcess.kill("SIGTERM");
      };
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();

      const limit = new Transform({
        transform: (chunk: Buffer, _enc, done) => {
          bytes += chunk.length;
          if (bytes > this.maxTrackBytes) done(new Error("Audio exceeds per-track cache limit"));
          else done(null, chunk);
        },
      });
      await pipeline(source.stream, limit, createWriteStream(temporary, { flags: "wx", mode: 0o600 }), {
        signal: controller.signal,
      });
      if (controller.signal.aborted || this.closed || !bytes) throw new Error("Audio cache download interrupted");
      // stdout can end before yt-dlp reports its exit status. Do not promote
      // incomplete/error responses to healthy cache entries on that race.
      if (sourceProcess.exitCode === null && sourceProcess.signalCode === null) {
        await once(sourceProcess, "close", { signal: controller.signal });
      }
      if (sourceProcess.exitCode !== 0 || sourceProcess.signalCode !== null) {
        throw new Error("Provider returned invalid audio");
      }

      // Atomic rename means playback never observes a partially downloaded file.
      await rename(temporary, output);
      const previous = this.ready.get(key);
      if (previous) this.totalBytes -= previous.bytes;
      this.ready.set(key, { path: output, bytes, touched: Date.now() });
      this.totalBytes += bytes;
      await this.trim();
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", onCancel);
      if (sourceProcess && sourceProcess.exitCode === null) sourceProcess.kill("SIGTERM");
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async trim(): Promise<void> {
    if (this.totalBytes <= this.maxBytes) return;
    const priority = new Map(this.allWanted().map((track, index) => [QueueAudioCache.key(track), index]));
    // Remove unrequested and farthest-in-queue tracks before upcoming ones.
    const victims = [...this.ready.entries()].sort(([keyA, a], [keyB, b]) => {
      const rankA = priority.get(keyA) ?? Number.MAX_SAFE_INTEGER;
      const rankB = priority.get(keyB) ?? Number.MAX_SAFE_INTEGER;
      return rankB - rankA || a.touched - b.touched;
    });
    for (const [key, entry] of victims) {
      if (this.totalBytes <= this.maxBytes) break;
      if (this.ready.get(key) !== entry) continue;
      try {
        await rm(entry.path, { force: true });
        this.ready.delete(key);
        this.totalBytes -= entry.bytes;
        // Avoid immediately downloading a low-priority entry we just evicted.
        this.failures.set(key, Date.now() + 5 * 60_000);
      } catch (error) {
        logger.debug({ err: error }, "Could not evict cached audio");
      }
    }
  }
}
