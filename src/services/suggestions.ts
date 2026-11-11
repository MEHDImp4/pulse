import { fetchJson } from "../utils/http";
import { logger } from "../utils/logger";
import { createTtlCache } from "../utils/ttlCache";
import { createCachedSingleFlight } from "../utils/asyncWork";

export interface Suggestion {
  name: string;
  value: string;
}

const MAX_CHOICE_LENGTH = 100;

export function parseSuggestions(payload: unknown, limit: number): Suggestion[] {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) return [];

  const items = payload[1] as unknown[];
  const seen = new Set<string>();
  const result: Suggestion[] = [];

  for (const item of items) {
    if (typeof item !== "string") continue;
    const value = item.trim().slice(0, MAX_CHOICE_LENGTH);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push({ name: value, value });
    if (result.length >= limit) break;
  }

  return result;
}

export interface SuggestionsProvider {
  suggest(query: string, limit?: number): Promise<Suggestion[]>;
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 200;

export class YouTubeSuggestions implements SuggestionsProvider {
  private readonly cache = createTtlCache<string, Suggestion[]>({
    ttlMs: CACHE_TTL_MS,
    maxEntries: CACHE_MAX_ENTRIES,
  });

  private readonly requests = createCachedSingleFlight(this.cache);

  constructor(
    private readonly timeoutMs = 800,
    private readonly request: typeof fetchJson = fetchJson,
  ) {}

  async suggest(query: string, limit = 10): Promise<Suggestion[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Repeated keystrokes resolve to the same query; serve them from a short
    // TTL cache instead of hitting the network every time.
    const cacheKey = `${limit}:${trimmed.toLowerCase()}`;
    try {
      return await this.requests.get(cacheKey, async () => {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(trimmed)}`;
        const payload = await this.request(url, {
          timeoutMs: this.timeoutMs,
          maxBytes: 200_000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        return parseSuggestions(payload, limit);
      });
    } catch (error) {
      logger.debug({ err: error }, "Suggestion lookup failed");
      return [];
    }
  }
}
