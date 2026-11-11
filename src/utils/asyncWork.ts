import type { TtlCache } from "./ttlCache";

/**
 * Share concurrent requests for the same key. Only successful lookups are
 * cached; errors are propagated to all waiters and never poison the cache.
 */
export function createCachedSingleFlight<K, V>(cache: TtlCache<K, V>) {
  const inFlight = new Map<K, Promise<V>>();

  return {
    get(key: K, load: () => Promise<V>): Promise<V> {
      const cached = cache.get(key);
      if (cached !== undefined) return Promise.resolve(cached);

      const existing = inFlight.get(key);
      if (existing) return existing;

      // Schedule the loader in a microtask so a synchronous throw also rejects
      // its shared promise and is cleaned up consistently.
      const work = Promise.resolve().then(load).then((value) => {
        cache.set(key, value);
        return value;
      });
      inFlight.set(key, work);
      // Use both handlers rather than a detached finally() promise, which
      // could itself become an unhandled rejection.
      void work.then(
        () => { inFlight.delete(key); },
        () => { inFlight.delete(key); },
      );
      return work;
    },
    get inFlightCount(): number {
      return inFlight.size;
    },
  };
}

/**
 * Bound simultaneous external metadata lookups without limiting active audio
 * streams. FIFO handoff reserves a slot for a queued waiter before resuming it.
 */
export function createConcurrencyLimiter(maxActive: number, maxWaiting = 64) {
  if (!Number.isInteger(maxActive) || maxActive < 1) {
    throw new Error("maxActive must be a positive integer");
  }
  if (!Number.isInteger(maxWaiting) || maxWaiting < 0) {
    throw new Error("maxWaiting must be a non-negative integer");
  }

  let active = 0;
  const waiting: Array<() => void> = [];

  async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < maxActive) {
      active += 1;
    } else {
      if (waiting.length >= maxWaiting) {
        throw new Error("Too many metadata lookups pending; retry in a moment");
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
      // The finishing task has reserved our slot (active is unchanged).
    }

    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  }

  return {
    run,
    get active(): number { return active; },
    get waiting(): number { return waiting.length; },
  };
}
