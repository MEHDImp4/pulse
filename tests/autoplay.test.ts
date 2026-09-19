import { describe, expect, it } from "vitest";
import { pickRandomRelatedTrack, pickRelatedTrack } from "../src/services/autoplay";
import type { Track } from "../src/music/Track";

function track(id: string): Track {
  return {
    id,
    title: id,
    webpageUrl: `https://www.youtube.com/watch?v=${id}`,
    requestedBy: { id: "u1", username: "Tester" },
    provider: "youtube",
  };
}

describe("pickRelatedTrack", () => {
  it("skips the seed and already played ids", () => {
    const candidates = [track("seed"), track("played"), track("fresh")];
    expect(pickRelatedTrack(candidates, "seed", new Set(["played"]))?.id).toBe("fresh");
  });

  it("returns undefined when nothing is eligible", () => {
    const candidates = [track("seed"), track("played")];
    expect(pickRelatedTrack(candidates, "seed", new Set(["played"]))).toBeUndefined();
  });

  it("returns undefined for an empty candidate list", () => {
    expect(pickRelatedTrack([], "seed", new Set())).toBeUndefined();
  });
});

describe("pickRandomRelatedTrack", () => {
  it("never returns the seed or an already played id", () => {
    const candidates = [track("seed"), track("played"), track("fresh"), track("other")];
    for (let i = 0; i < 50; i++) {
      const picked = pickRandomRelatedTrack(candidates, "seed", new Set(["played"]));
      expect(["fresh", "other"]).toContain(picked?.id);
    }
  });

  it("returns undefined when nothing is eligible", () => {
    const candidates = [track("seed"), track("played")];
    expect(pickRandomRelatedTrack(candidates, "seed", new Set(["played"]))).toBeUndefined();
  });

  it("returns undefined for an empty candidate list", () => {
    expect(pickRandomRelatedTrack([], "seed", new Set())).toBeUndefined();
  });
});
