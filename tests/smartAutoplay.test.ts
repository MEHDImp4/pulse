import { describe, expect, it } from "vitest";
import { pickSmartRelatedTrack } from "../src/services/autoplay";
import type { Track } from "../src/music/Track";
const track = (id: string, title: string, author = "A"): Track => ({
  id, title, author, duration: 180, webpageUrl: "https://youtube.com/watch?v=abc",
  requestedBy: { id: "u", username: "u" }, provider: "youtube",
});
describe("smart autoplay", () => {
  it("excludes played tracks and avoids karaoke clones where alternatives exist", () => {
    const seed = track("seed", "Original");
    const selected = pickSmartRelatedTrack(
      [track("seed", "Original"), track("a", "Original karaoke"), track("b", "Fresh song")],
      seed, new Set(), () => 0,
    );
    expect(selected?.id).toBe("b");
    expect(pickSmartRelatedTrack([track("seed", "Original")], seed, new Set())).toBeUndefined();
  });
  it("returns candidates when only one fresh song remains", () => {
    const seed = track("seed", "S");
    expect(pickSmartRelatedTrack([track("b", "Fresh")], seed, new Set())?.id).toBe("b");
  });
});
