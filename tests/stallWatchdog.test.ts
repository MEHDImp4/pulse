import { describe, expect, it } from "vitest";
import { evaluateStall } from "../src/audio/stallWatchdog";

const base = {
  previousDuration: 10_000,
  currentDuration: 10_000,
  stalledChecks: 0,
  checkIntervalMs: 10_000,
  stallTimeoutMs: 30_000,
  recoveries: 0,
  maxRecoveries: 2,
};

describe("evaluateStall", () => {
  it("does nothing while playback progresses", () => {
    expect(evaluateStall({ ...base, currentDuration: 20_000 })).toEqual({
      stalledChecks: 0,
      action: "none",
    });
  });

  it("treats a duration decrease (seek/reload) as a reset, not a stall", () => {
    expect(evaluateStall({ ...base, currentDuration: 0, stalledChecks: 3 })).toEqual({
      stalledChecks: 0,
      action: "none",
    });
  });

  it("accumulates checks until the timeout, then recovers", () => {
    const first = evaluateStall(base);
    expect(first).toEqual({ stalledChecks: 1, action: "none" });

    const second = evaluateStall({ ...base, stalledChecks: first.stalledChecks });
    expect(second).toEqual({ stalledChecks: 2, action: "none" });

    const third = evaluateStall({ ...base, stalledChecks: second.stalledChecks });
    expect(third).toEqual({ stalledChecks: 0, action: "recover" });
  });

  it("skips instead of recovering once the cap is reached", () => {
    expect(evaluateStall({ ...base, stalledChecks: 2, recoveries: 2 })).toEqual({
      stalledChecks: 0,
      action: "skip",
    });
  });

  it("is disabled when the interval or timeout is non-positive", () => {
    expect(evaluateStall({ ...base, checkIntervalMs: 0, stalledChecks: 5 })).toEqual({
      stalledChecks: 0,
      action: "none",
    });
    expect(evaluateStall({ ...base, stallTimeoutMs: 0, stalledChecks: 5 })).toEqual({
      stalledChecks: 0,
      action: "none",
    });
  });
});
