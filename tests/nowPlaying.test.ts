import { describe, expect, it } from "vitest";
import { renderSignature, type NowPlayingSnapshot } from "../src/services/nowPlaying";

function snapshot(overrides: Partial<NowPlayingSnapshot> = {}): NowPlayingSnapshot {
  return {
    trackId: "t1",
    state: "PLAYING",
    elapsedSecond: 10,
    volume: 100,
    filter: "off",
    loopMode: "off",
    autoplay: true,
    queueSize: 2,
    ...overrides,
  };
}

describe("renderSignature", () => {
  it("is stable for identical snapshots", () => {
    expect(renderSignature(snapshot())).toBe(renderSignature(snapshot()));
  });

  it("changes when the elapsed second changes", () => {
    expect(renderSignature(snapshot({ elapsedSecond: 10 }))).not.toBe(
      renderSignature(snapshot({ elapsedSecond: 11 })),
    );
  });

  it("is unchanged for a repeated paused frame", () => {
    const paused = snapshot({ state: "PAUSED", elapsedSecond: 30 });
    expect(renderSignature(paused)).toBe(renderSignature({ ...paused }));
  });

  it("changes when any rendered field changes", () => {
    const base = renderSignature(snapshot());
    expect(renderSignature(snapshot({ volume: 50 }))).not.toBe(base);
    expect(renderSignature(snapshot({ filter: "bassboost" }))).not.toBe(base);
    expect(renderSignature(snapshot({ loopMode: "queue" }))).not.toBe(base);
    expect(renderSignature(snapshot({ autoplay: false }))).not.toBe(base);
    expect(renderSignature(snapshot({ trackId: "t2" }))).not.toBe(base);
    expect(renderSignature(snapshot({ queueSize: 3 }))).not.toBe(base);
    expect(renderSignature(snapshot({ state: "PLAYING" }))).not.toBe(
      renderSignature(snapshot({ state: "BUFFERING" })),
    );
  });
});
