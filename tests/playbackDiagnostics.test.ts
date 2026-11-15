import { describe, expect, it } from "vitest";
import { PlaybackDiagnostics } from "../src/music/PlaybackDiagnostics";

describe("PlaybackDiagnostics", () => {
  it("summarizes p95 and slow transitions without keeping an unlimited history", () => {
    const diagnostics = new PlaybackDiagnostics(3, 1_000);
    diagnostics.transition(120);
    diagnostics.transition(240);
    diagnostics.transition(1_200);
    diagnostics.transition(360);
    diagnostics.transition(Number.NaN);

    expect(diagnostics.snapshot()).toEqual({
      transitions: 4,
      avgTransitionMs: 600,
      p95TransitionMs: 1_200,
      maxTransitionMs: 1_200,
      lastTransitionMs: 360,
      slowTransitions: 1,
      preloadHits: 0,
      cacheHits: 0,
      cacheMisses: 0,
      stallRecoveries: 0,
      stallSkips: 0,
      startFailures: 0,
      playerErrors: 0,
    });
  });

  it("tracks cache, fallback, stalls and player failures independently", () => {
    const diagnostics = new PlaybackDiagnostics();
    diagnostics.cacheUsed();
    diagnostics.streamed();
    diagnostics.preloadUsed();
    diagnostics.stallRecovered();
    diagnostics.stallSkipped();
    diagnostics.startFailed();
    diagnostics.playerErrored();
    const state = diagnostics.snapshot();
    expect(state.cacheHits).toBe(1);
    expect(state.cacheMisses).toBe(1);
    expect(state.preloadHits).toBe(1);
    expect(state.stallRecoveries).toBe(1);
    expect(state.stallSkips).toBe(1);
    expect(state.startFailures).toBe(1);
    expect(state.playerErrors).toBe(1);
  });

  it("does not confuse a track without a transition with zero-millisecond playback", () => {
    const diagnostics = new PlaybackDiagnostics();
    expect(diagnostics.snapshot().transitions).toBe(0);
    expect(diagnostics.snapshot().lastTransitionMs).toBeUndefined();
  });
});
