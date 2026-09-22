export interface TtlCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  clear(): void;
  readonly size: number;
}

export interface TtlCacheOptions {
  /** Entry lifetime in ms. A value <= 0 disables the cache entirely. */
  ttlMs: number;
  /** Hard cap on stored entries; oldest entries are evicted first. */
  maxEntries: number;
  /** Injectable clock, for tests. */
  now?: () => number;
}

/**
 * Minimal bounded TTL cache (insertion-order LRU eviction). Pure over an
 * injectable clock so its expiry/eviction behavior is unit-testable. Never
 * used for transient stream URLs: only for stable metadata.
 */
export function createTtlCache<K, V>(options: TtlCacheOptions): TtlCache<K, V> {
  const now = options.now ?? Date.now;
  const entries = new Map<K, { at: number; value: V }>();

  const evictOverflow = (): void => {
    if (entries.size <= options.maxEntries) return;
    const excess = entries.size - options.maxEntries;
    let removed = 0;
    for (const key of entries.keys()) {
      entries.delete(key);
      if (++removed >= excess) break;
    }
  };

  return {
    get(key) {
      if (options.ttlMs <= 0) return undefined;
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at >= options.ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (options.ttlMs <= 0 || options.maxEntries <= 0) return;
      entries.delete(key);
      entries.set(key, { at: now(), value });
      evictOverflow();
    },
    delete(key) {
      return entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
