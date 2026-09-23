import { describe, expect, it } from "vitest";
import { lyricsCacheKey } from "../src/services/lyrics";

describe("lyricsCacheKey", () => {
  it("normalizes case and surrounding whitespace", () => {
    const a = lyricsCacheKey({ title: "  Hello  ", artist: "ADELE", durationSeconds: 295 });
    const b = lyricsCacheKey({ title: "hello", artist: "adele", durationSeconds: 295 });
    expect(a).toBe(b);
  });

  it("distinguishes different durations and artists", () => {
    const base = lyricsCacheKey({ title: "Hello", artist: "Adele", durationSeconds: 295 });
    expect(lyricsCacheKey({ title: "Hello", artist: "Adele", durationSeconds: 296 })).not.toBe(base);
    expect(lyricsCacheKey({ title: "Hello", artist: "Other", durationSeconds: 295 })).not.toBe(base);
  });

  it("handles a missing artist", () => {
    expect(lyricsCacheKey({ title: "Only Title" })).toBe("only title||");
  });
});
