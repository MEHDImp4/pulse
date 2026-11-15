import { describe, expect, it } from "vitest";
import { buildFilterChain, FADE_SECONDS, FILTER_PRESETS, isFilterPreset } from "../src/audio/filters";

describe("isFilterPreset", () => {
  it("accepts every known preset", () => {
    for (const preset of FILTER_PRESETS) {
      expect(isFilterPreset(preset)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isFilterPreset("metal")).toBe(false);
    expect(isFilterPreset(undefined)).toBe(false);
    expect(isFilterPreset(42)).toBe(false);
  });
});

describe("buildFilterChain", () => {
  it("starts with a fade-in when playing from the top", () => {
    expect(buildFilterChain("off", undefined, 0)).toBe(`afade=t=in:st=0:d=${FADE_SECONDS}`);
  });

  it("includes the selected preset filter", () => {
    const chain = buildFilterChain("bassboost", 100, 0);
    expect(chain).toContain("bass=g=5");
    expect(chain).not.toContain("asetrate");
  });

  it("keeps presets mutually exclusive", () => {
    const chain = buildFilterChain("nightcore", 100, 0);
    expect(chain).toContain("asetrate=48000*1.25");
    expect(chain).not.toContain("bass=g=5");
    expect(chain).not.toContain("apulsator");
  });

  it("adds a fade-out when the duration is known", () => {
    expect(buildFilterChain("off", 100, 0)).toContain("afade=t=out");
  });

  it("drops the fade-in when seeking mid-track", () => {
    const chain = buildFilterChain("treble", 200, 30);
    expect(chain).toBeDefined();
    expect(chain).not.toContain("afade=t=in");
    expect(chain).toContain("afade=t=out");
    expect(chain).toContain("treble=g=5");
  });

  it("returns no chain for a mid-track seek with no filter or duration", () => {
    expect(buildFilterChain("off", undefined, 30)).toBeUndefined();
  });
});

describe("Audio quality options", () => {
  it("can normalize a Bass Boost track without disabling the selected preset", () => {
    const chain = buildFilterChain("bassboost", 160, 0, { normalize: true });
    expect(chain).toContain("bass=g=5");
    expect(chain).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(chain?.match(/loudnorm=/g)).toHaveLength(1);
  });

  it("does not apply loudnorm twice when the preset already is Normalisation", () => {
    const chain = buildFilterChain("loudnorm", 160, 0, { normalize: true });
    expect(chain?.match(/loudnorm=/g)).toHaveLength(1);
  });

  it("trims only leading silence on fresh playback, never on seek", () => {
    const fresh = buildFilterChain("off", 180, 0, { trimStartSilence: true });
    const resumed = buildFilterChain("off", 180, 35, { trimStartSilence: true });
    expect(fresh).toContain("silenceremove=start_periods=1");
    expect(fresh).not.toContain("stop_periods");
    expect(resumed).not.toContain("silenceremove");
  });

  it("allows fades to be disabled or customized", () => {
    expect(buildFilterChain("off", 100, 0, { fadeSeconds: 0 })).toBeUndefined();
    expect(buildFilterChain("off", 100, 0, { fadeSeconds: 4 }))
      .toBe("afade=t=in:st=0:d=4,afade=t=out:st=96:d=4");
    expect(buildFilterChain("off", 100, 0, { fadeSeconds: 42 })).toContain("d=5");
  });

  it("never adds a scheduled ending fade for unknown duration", () => {
    const chain = buildFilterChain("off", undefined, 0, {
      normalize: true, trimStartSilence: true, fadeSeconds: 2,
    });
    expect(chain).not.toContain("afade=t=out");
  });
});
