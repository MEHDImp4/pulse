import { describe, expect, it, vi } from "vitest";

describe("metrics", () => {
  it("counts started and failed tracks", async () => {
    vi.resetModules();
    const metrics = await import("../src/utils/metrics");

    expect(metrics.metricsSnapshot()).toEqual({ tracksStarted: 0, tracksFailed: 0 });

    metrics.recordTrackStarted();
    metrics.recordTrackStarted();
    metrics.recordTrackFailed();

    expect(metrics.metricsSnapshot()).toEqual({ tracksStarted: 2, tracksFailed: 1 });
  });
});
