import { describe, expect, it, vi } from "vitest";
import { GuildPlayer } from "../src/music/GuildPlayer";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";
import type { RequestedBy, Track } from "../src/music/Track";

function track(id: string, user: string): Track {
  return {
    id, title: id, provider: "youtube", webpageUrl: "https://youtube.com/watch?v=" + id,
    requestedBy: { id: user, username: user }, duration: 90,
  };
}

class StubProvider implements AudioProvider {
  readonly name = "youtube" as const;
  supports(): boolean { return false; }
  async search(_query: string, _by: RequestedBy): Promise<Track> { return track("search", "a"); }
  async resolve(_url: string, _by: RequestedBy): Promise<Track> { return track("url", "b"); }
  async createSource(): Promise<AudioSource> { return { kind: "url", url: "https://example.invalid/audio" }; }
}

describe("persistent party queue mode", () => {
  it("starts disabled with a max of three queued tracks per requester", () => {
    const player = new GuildPlayer("party", "voice", new StubProvider(), () => {});
    expect(player.partyMode).toBe(false);
    expect(player.partyMaxPerUser).toBe(3);
  });

  it("rebalances after new song arrivals, preserving each requester's order", () => {
    const persist = vi.fn();
    const player = new GuildPlayer("party", "voice", new StubProvider(), () => {},
      undefined, undefined, persist);
    player.queue.enqueue(track("a1", "a"));
    player.queue.enqueue(track("a2", "a"));
    player.queue.enqueue(track("b1", "b"));
    player.configureParty(true, 2);
    expect(player.queue.snapshot().map((song) => song.id)).toEqual(["a1", "b1", "a2"]);
    player.queue.enqueue(track("b2", "b"));
    player.notifyQueueChange();
    expect(player.queue.snapshot().map((song) => song.id)).toEqual(["a1", "b1", "a2", "b2"]);
    expect(persist).toHaveBeenCalledWith({ partyMode: true, partyMaxPerUser: 2 });
  });

  it("turning party mode off preserves the queue without further reordering", () => {
    const player = new GuildPlayer("party", "voice", new StubProvider(), () => {});
    player.configureParty(true, 2);
    player.configureParty(false);
    player.queue.enqueue(track("a1", "a"));
    player.queue.enqueue(track("a2", "a"));
    player.queue.enqueue(track("b1", "b"));
    player.notifyQueueChange();
    expect(player.queue.snapshot().map((song) => song.id)).toEqual(["a1", "a2", "b1"]);
  });

  it("clamps invalid per-user limit rather than disabling the cap", () => {
    const player = new GuildPlayer("party", "voice", new StubProvider(), () => {});
    player.configureParty(true, 100);
    expect(player.partyMaxPerUser).toBe(10);
    player.configureParty(true, -4);
    expect(player.partyMaxPerUser).toBe(1);
  });
});
