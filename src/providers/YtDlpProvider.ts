import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { env, type SponsorblockMode } from "../config/env";
import type { RequestedBy, Track, TrackProvider } from "../music/Track";
import { logger } from "../utils/logger";
import { runProcess } from "../utils/process";
import { createCachedSingleFlight, createConcurrencyLimiter } from "../utils/asyncWork";
import { createTtlCache } from "../utils/ttlCache";
import type { AudioProvider, AudioSource, PlaylistResult } from "./AudioProvider";

export interface YtDlpInfo {
  id?: string;
  title?: string;
  webpage_url?: string;
  original_url?: string;
  url?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  duration?: number;
  uploader?: string;
  channel?: string;
  entries?: YtDlpInfo[];
}

export interface FlatPlaylist {
  title?: string;
  entries: YtDlpInfo[];
}

// Shared by YouTube and SoundCloud: metadata extraction must not spawn an
// unbounded number of yt-dlp processes when many servers search at once.
const metadataLimiter = createConcurrencyLimiter(
  env.metadataMaxConcurrent,
  env.metadataMaxPending,
);

/**
 * Builds the SponsorBlock yt-dlp flags for the configured mode. `remove` cuts
 * the segments during streaming (extra FFmpeg work), `mark` only marks them.
 * Pure and exported for testing.
 */
export function sponsorblockArgs(mode: SponsorblockMode, categories: string): string[] {
  if (mode === "off" || !categories.trim()) return [];
  return [mode === "mark" ? "--sponsorblock-mark" : "--sponsorblock-remove", categories];
}

/**
 * Shared yt-dlp plumbing for stream-based providers (YouTube, SoundCloud).
 * Subclasses only declare their name, search prefix and URL policy.
 */
export abstract class YtDlpProvider implements AudioProvider {
  abstract readonly name: TrackProvider;
  protected abstract readonly searchPrefix: string;
  protected abstract isAllowedUrl(url: string): boolean;

  // Stable metadata (title/duration/thumbnail/canonical URL) is safe to cache
  // for a short TTL, so repeated searches or link resolutions do not respawn
  // yt-dlp. Stream URLs are never cached: they are resolved just-in-time.
  private readonly infoCache = createTtlCache<string, YtDlpInfo>({
    ttlMs: env.metadataCacheTtlMs,
    maxEntries: env.metadataCacheMaxEntries,
  });

  private readonly infoRequests = createCachedSingleFlight(this.infoCache);

  // A short cache for *flat* playlist/mix/search entries, never media URLs.
  // Cache keys include the item cap so small playlists are not reused for
  // later requests with a different limit.
  private readonly playlistCache = createTtlCache<string, FlatPlaylist>({
    ttlMs: Math.min(env.metadataCacheTtlMs, 5 * 60_000),
    maxEntries: Math.min(env.metadataCacheMaxEntries, 100),
  });
  private readonly playlistRequests = createCachedSingleFlight(this.playlistCache);

  /** Fallback URL built from an id when yt-dlp returns none (YouTube only). */
  protected urlFromId(_id: string): string | undefined {
    return undefined;
  }

  supports(url: string): boolean {
    return this.isAllowedUrl(url);
  }

  async search(query: string, requestedBy: RequestedBy): Promise<Track> {
    const normalized = query.trim();
    if (!normalized) throw new Error("La recherche est vide.");

    const info = await this.fetchInfo(`${this.searchPrefix}1:${normalized}`);
    return this.toTrack(info, requestedBy);
  }

  async searchChoices(query: string, requestedBy: RequestedBy, limit = 5): Promise<Track[]> {
    const normalized = query.trim();
    if (!normalized) throw new Error("La recherche est vide.");
    const count = Math.max(1, Math.min(10, Math.floor(limit)));
    const result = await this.fetchEntries(`${this.searchPrefix}${count}:${normalized}`, count);
    return this.toTracks(result.entries, requestedBy).slice(0, count);
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    if (!this.isAllowedUrl(url)) {
      throw new Error(`URL non supportée par ${this.name}.`);
    }
    const info = await this.fetchInfo(url);
    return this.toTrack(info, requestedBy);
  }

  async resolvePlaylist(
    url: string,
    requestedBy: RequestedBy,
    limit = env.playlistMaxItems,
  ): Promise<PlaylistResult> {
    if (!this.isAllowedUrl(url)) {
      throw new Error(`URL non supportée par ${this.name}.`);
    }

    const capped = Math.max(1, Math.min(limit, env.playlistMaxItems));
    const playlist = await this.fetchEntries(url, capped);
    return { title: playlist.title, tracks: this.toTracks(playlist.entries, requestedBy) };
  }

  async createSource(track: Track): Promise<AudioSource> {
    // Defense in depth: never feed yt-dlp a URL that this provider does not
    // claim, even if a tampered persisted queue produced the track.
    if (!this.isAllowedUrl(track.webpageUrl)) {
      throw new Error(`URL non supportée par ${this.name}.`);
    }

    const args = [
      ...this.streamArgs(),
      "-f",
      "bestaudio/best",
      "-o",
      "-",
      "--",
      track.webpageUrl,
    ];

    const process = spawn(
      env.ytdlpPath,
      args,
      { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true },
    );

    let stderr = "";

    process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr = (stderr + text).slice(-8000);
      logger.debug({ track: track.title, ytdlp: text.trim() }, "yt-dlp stderr");
    });

    process.on("error", (error) => {
      logger.error({ err: error, track: track.title }, "yt-dlp process error");
    });

    process.on("close", (code, signal) => {
      if (code !== 0) {
        logger.error({ track: track.title, code, signal, stderr: stderr.trim() }, "yt-dlp exited with an error");
      } else {
        logger.info({ track: track.title, code, signal }, "yt-dlp stream finished");
      }
    });

    return { kind: "pipe", stream: process.stdout as Readable, process: process as ChildProcess };
  }

  protected toTracks(entries: readonly YtDlpInfo[], requestedBy: RequestedBy): Track[] {
    const tracks: Track[] = [];
    for (const entry of entries) {
      try {
        tracks.push(this.toTrack(entry, requestedBy));
      } catch (error) {
        logger.debug({ err: error }, "Skipping unparsable yt-dlp entry");
      }
    }
    return tracks;
  }

  protected toTrack(info: YtDlpInfo, requestedBy: RequestedBy): Track {
    const id = info.id?.trim();
    const title = info.title?.trim();
    const webpageUrl = this.resolveWebpageUrl(info);

    if (!id || !title || !webpageUrl) {
      throw new Error("Métadonnées de piste incomplètes renvoyées par yt-dlp.");
    }

    return {
      id,
      title,
      webpageUrl,
      thumbnail: info.thumbnail || info.thumbnails?.find((item) => item.url)?.url || undefined,
      duration: typeof info.duration === "number" ? info.duration : undefined,
      author: info.uploader || info.channel || undefined,
      requestedBy,
      provider: this.name,
    };
  }

  private resolveWebpageUrl(info: YtDlpInfo): string | undefined {
    if (info.webpage_url) return info.webpage_url;
    if (info.original_url) return info.original_url;
    if (info.url && /^https?:\/\//i.test(info.url)) return info.url;
    if (info.id) return this.urlFromId(info.id);
    return undefined;
  }

  protected async runMetadata(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return metadataLimiter.run(() =>
      runProcess(env.ytdlpPath, args, { timeoutMs: env.externalProcessTimeoutMs }),
    );
  }

  protected async fetchInfo(target: string): Promise<YtDlpInfo> {
    return this.infoRequests.get(target, async () => {
      const { stdout } = await this.runMetadata([
        ...this.metadataArgs(),
        "--dump-json", "--skip-download", "--", target,
      ]);

      try {
        const line = stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
        if (!line) throw new Error("Réponse de métadonnées yt-dlp vide.");
        return JSON.parse(line) as YtDlpInfo;
      } catch {
        throw new Error("Impossible d'analyser les métadonnées yt-dlp.");
      }
    });
  }

  protected async fetchEntries(target: string, limit: number): Promise<FlatPlaylist> {
    const cappedLimit = Math.max(1, limit);
    const key = JSON.stringify([target, cappedLimit]);
    return this.playlistRequests.get(key, async () => {
      const { stdout } = await this.runMetadata([
        ...this.baseArgs(),
        "--flat-playlist",
        "--dump-single-json",
        "--playlist-end", String(cappedLimit),
        "--", target,
      ]);

      try {
        const line = stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
        if (!line) throw new Error("Réponse de playlist yt-dlp vide.");
        const parsed = JSON.parse(line) as YtDlpInfo;
        return {
          title: parsed.title,
          entries: Array.isArray(parsed.entries) ? parsed.entries : [parsed],
        };
      } catch {
        throw new Error("Impossible d'analyser les métadonnées de playlist yt-dlp.");
      }
    });
  }

  protected baseArgs(): string[] {
    const args = ["--js-runtimes", "node", "--no-warnings"];
    if (env.ytdlpCookiesFile) args.push("--cookies", env.ytdlpCookiesFile);
    return args;
  }

  protected metadataArgs(): string[] {
    return [...this.baseArgs(), "--no-playlist"];
  }

  protected streamArgs(): string[] {
    return [
      ...this.metadataArgs(),
      ...sponsorblockArgs(env.sponsorblockMode, env.sponsorblockCategories),
    ];
  }
}
