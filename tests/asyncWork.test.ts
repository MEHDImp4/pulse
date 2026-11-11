import { describe, expect, it, vi } from "vitest";
import { createCachedSingleFlight, createConcurrencyLimiter } from "../src/utils/asyncWork";
import { createTtlCache } from "../src/utils/ttlCache";

describe("cached single-flight", () => {
  it("coalesces the same key and caches the successful result", async () => {
    const cache = createTtlCache<string, string>({ ttlMs: 10_000, maxEntries: 10 });
    const work = createCachedSingleFlight(cache);
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => { release = resolve; });
    const load = vi.fn(() => gate);
    const a = work.get("key", load);
    const b = work.get("key", load);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(work.inFlightCount).toBe(1);
    release("result");
    expect(await Promise.all([a, b])).toEqual(["result", "result"]);
    expect(await work.get("key", load)).toBe("result");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches failures and allows retries", async () => {
    const cache = createTtlCache<string, string>({ ttlMs: 10_000, maxEntries: 10 });
    const work = createCachedSingleFlight(cache);
    const fail = vi.fn(async () => { throw new Error("failed"); });
    const a = work.get("key", fail);
    const b = work.get("key", fail);
    await expect(a).rejects.toThrow("failed");
    await expect(b).rejects.toThrow("failed");
    expect(fail).toHaveBeenCalledTimes(1);
    await expect(work.get("key", async () => "ok")).resolves.toBe("ok");
    expect(work.inFlightCount).toBe(0);
  });

  it("caches zero-like values without confusing them with misses", async () => {
    const cache = createTtlCache<string, number>({ ttlMs: 10_000, maxEntries: 10 });
    const work = createCachedSingleFlight(cache);
    const loader = vi.fn(async () => 0);
    await expect(work.get("x", loader)).resolves.toBe(0);
    await expect(work.get("x", loader)).resolves.toBe(0);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("concurrency limiter", () => {
  it("honors its capacity, FIFO ordering and slot reservation", async () => {
    const limiter = createConcurrencyLimiter(1, 2);
    let firstRelease!: () => void;
    const gate = new Promise<void>((resolve) => { firstRelease = resolve; });
    const order: number[] = [];
    const first = limiter.run(async () => { order.push(1); await gate; });
    const second = limiter.run(async () => { order.push(2); });
    const third = limiter.run(async () => { order.push(3); });
    expect(limiter.active).toBe(1);
    expect(limiter.waiting).toBe(2);
    await expect(limiter.run(async () => "overflow")).rejects.toThrow("Too many metadata");
    firstRelease();
    await Promise.all([first, second, third]);
    expect(order).toEqual([1, 2, 3]);
    expect(limiter.active).toBe(0);
    expect(limiter.waiting).toBe(0);
  });

  it("releases capacity when a task rejects", async () => {
    const limiter = createConcurrencyLimiter(1);
    await expect(limiter.run(async () => { throw new Error("bad"); })).rejects.toThrow("bad");
    await expect(limiter.run(async () => "good")).resolves.toBe("good");
  });
});
