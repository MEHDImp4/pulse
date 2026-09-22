import { describe, expect, it } from "vitest";
import { createTtlCache } from "../src/utils/ttlCache";

describe("createTtlCache", () => {
  it("returns stored values before the TTL elapses", () => {
    let now = 1_000;
    const cache = createTtlCache<string, number>({ ttlMs: 100, maxEntries: 10, now: () => now });

    cache.set("a", 1);
    now = 1_050;

    expect(cache.get("a")).toBe(1);
  });

  it("expires values once the TTL elapses", () => {
    let now = 0;
    const cache = createTtlCache<string, number>({ ttlMs: 100, maxEntries: 10, now: () => now });

    cache.set("a", 1);
    now = 100;

    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the oldest entries beyond the cap", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("is fully disabled when ttlMs is zero or negative", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 0, maxEntries: 10, now: () => 0 });

    cache.set("a", 1);

    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("refreshes insertion order on overwrite", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 1_000, maxEntries: 2, now: () => 0 });

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(10);
    expect(cache.get("c")).toBe(3);
  });

  it("supports delete and clear", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 1_000, maxEntries: 10, now: () => 0 });

    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);

    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
