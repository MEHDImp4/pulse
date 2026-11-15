import { describe, expect, it } from "vitest";
import { buildCrossfadeGraph, planCrossfade } from "../src/audio/crossfade";
import type { Track } from "../src/music/Track";

function song(id: string, duration?: number, isLive?: boolean): Track {
  return {
    id, duration, isLive, title: id,
    provider: "youtube",
    webpageUrl: `https://www.youtube.com/watch?v=${id}`,
    requestedBy: { id: "tester", username: "Tester" },
  };
}

describe("cached crossfade planning", () => {
  it("schedules the real overlap at the end of A", () => {
    const plan = planCrossfade(song("A", 180), song("B", 150), 3, "off", false);
    expect(plan).toEqual({ overlapSeconds: 3, startAtSeconds: 177 });
  });

  it("rejects live, unknown-duration or too-short tracks", () => {
    expect(planCrossfade(song("live", 120, true), song("B", 60), 3, "off", false)).toBeUndefined();
    expect(planCrossfade(song("A"), song("B", 60), 3, "off", false)).toBeUndefined();
    expect(planCrossfade(song("A", 5), song("B", 60), 3, "off", false)).toBeUndefined();
    expect(planCrossfade(song("A", 60), song("B", 6), 3, "off", false)).toBeUndefined();
  });

  it("rejects invalid overlap, tempo changes and silence trimming", () => {
    const current = song("A", 120);
    const next = song("B", 120);
    for (const seconds of [-1, 0, 6, 2.5]) {
      expect(planCrossfade(current, next, seconds, "off", false)).toBeUndefined();
    }
    expect(planCrossfade(current, next, 3, "nightcore", false)).toBeUndefined();
    expect(planCrossfade(current, next, 3, "vaporwave", false)).toBeUndefined();
    expect(planCrossfade(current, next, 3, "off", true)).toBeUndefined();
  });

  it("uses one overlap graph that continues playing the rest of B", () => {
    const plan = planCrossfade(song("A", 200), song("B", 100), 4, "off", false)!;
    const graph = buildCrossfadeGraph(plan, 100, true, 2);
    expect(graph).toContain("[0:a]atrim=duration=4,asetpts=PTS-STARTPTS[a]");
    expect(graph).toContain("[1:a]asetpts=PTS-STARTPTS[b]");
    expect(graph).toContain("[a][b]acrossfade=d=4:c1=tri:c2=tri");
    expect(graph).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(graph).toContain("afade=t=out:st=98:d=2");
    expect(graph).not.toContain("afade=t=in");
  });
});
