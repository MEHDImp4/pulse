import { env } from "../config/env";
import { fetchJson } from "../utils/http";
import { asString } from "../utils/strings";
import { createTtlCache } from "../utils/ttlCache";
import { parseLrc, type LrcLine } from "./lrc";

export interface LyricsQuery {
  title: string;
  artist?: string;
  durationSeconds?: number;
}

export interface LyricsResult {
  trackName: string;
  artistName: string;
  plain?: string;
  synced?: LrcLine[];
  source: string;
}

interface LrclibResponse {
  trackName?: string;
  artistName?: string;
  syncedLyrics?: string;
  plainLyrics?: string;
  instrumental?: boolean;
}

function toResult(value: unknown): LyricsResult | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const payload = value as LrclibResponse;

  const trackName = asString(payload.trackName) ?? "Titre inconnu";
  const artistName = asString(payload.artistName) ?? "";

  if (payload.instrumental === true) {
    return { trackName, artistName, plain: "(Instrumental)", source: "lrclib" };
  }

  const plain = asString(payload.plainLyrics);
  const syncedLyrics = asString(payload.syncedLyrics);
  const synced = syncedLyrics ? parseLrc(syncedLyrics) : [];

  if (!plain && synced.length === 0) return undefined;

  return {
    trackName,
    artistName,
    plain,
    synced: synced.length > 0 ? synced : undefined,
    source: "lrclib",
  };
}

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 500;

/** Normalized cache key for a lyrics query. Pure and exported for testing. */
export function lyricsCacheKey(query: LyricsQuery): string {
  return [
    query.title.trim().toLowerCase(),
    (query.artist ?? "").trim().toLowerCase(),
    query.durationSeconds ?? "",
  ].join("|");
}

/** Fetches lyrics from lrclib.net (exact match first, then search). */
export class LyricsService {
  private readonly cache = createTtlCache<string, LyricsResult | null>({
    ttlMs: CACHE_TTL_MS,
    maxEntries: CACHE_MAX_ENTRIES,
  });

  constructor(
    private readonly baseUrl = env.lyricsApiBase,
    private readonly timeoutMs = env.lyricsTimeoutMs,
  ) {}

  async lookup(query: LyricsQuery): Promise<LyricsResult | undefined> {
    const key = lyricsCacheKey(query);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached ?? undefined;

    const result = await this.lookupUncached(query);
    // Cache misses (null) too, so a track without lyrics is not re-queried.
    this.cache.set(key, result ?? null);
    return result;
  }

  private async lookupUncached(query: LyricsQuery): Promise<LyricsResult | undefined> {
    const exact = await this.getExact(query);
    if (exact) return exact;

    const term = [query.artist, query.title].filter(Boolean).join(" ").trim();
    if (!term) return undefined;
    return this.search(term);
  }

  private async getExact(query: LyricsQuery): Promise<LyricsResult | undefined> {
    const params = new URLSearchParams();
    params.set("track_name", query.title);
    if (query.artist) params.set("artist_name", query.artist);
    if (query.durationSeconds !== undefined) {
      params.set("duration", String(Math.round(query.durationSeconds)));
    }

    try {
      const payload = (await fetchJson(`${this.baseUrl}/api/get?${params.toString()}`, {
        timeoutMs: this.timeoutMs,
      })) as LrclibResponse;
      return toResult(payload);
    } catch {
      return undefined;
    }
  }

  private async search(term: string): Promise<LyricsResult | undefined> {
    try {
      const payload = (await fetchJson(
        `${this.baseUrl}/api/search?q=${encodeURIComponent(term)}`,
        { timeoutMs: this.timeoutMs },
      )) as LrclibResponse[];

      if (!Array.isArray(payload)) return undefined;
      const match = payload.find(
        (item) => typeof item === "object" && item !== null && (item.syncedLyrics || item.plainLyrics),
      );
      return match ? toResult(match) : undefined;
    } catch {
      return undefined;
    }
  }
}
