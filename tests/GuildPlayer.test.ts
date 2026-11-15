import { describe, expect, it } from "vitest";
import type { RequestedBy, Track } from "../src/music/Track";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";
import { GuildPlayer, peekNextTrack } from "../src/music/GuildPlayer";

class StubProvider implements AudioProvider {
  readonly name = "youtube" as const;

  supports(): boolean {
    return false;
  }

  async search(query: string, requestedBy: RequestedBy): Promise<Track> {
    return { id: query, title: query, webpageUrl: "https://youtube.com/watch?v=test", requestedBy, provider: "youtube" };
  }
  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    return { id: "url", title: "URL", webpageUrl: url, requestedBy, provider: "youtube" };
  }
  async createSource(): Promise<AudioSource> {
    return { kind: "url", url: "https://example.invalid/audio" };
  }
}

describe("GuildPlayer", () => {
  it("starts with lastTextChannelId undefined", () => {
    const player = new GuildPlayer("guild-1", "channel-1", new StubProvider(), () => {});
    expect(player.lastTextChannelId).toBeUndefined();
  });

  it("exposes its session identity", () => {
    const player = new GuildPlayer("guild-1", "channel-1", new StubProvider(), () => {});
    expect(player.sessionId).toBe("guild-1:channel-1");
    expect(player.channelId).toBe("channel-1");
  });

  it("stores and retrieves lastTextChannelId", () => {
    const player = new GuildPlayer("guild-1", "channel-1", new StubProvider(), () => {});
    player.lastTextChannelId = "channel-123";
    expect(player.lastTextChannelId).toBe("channel-123");
  });

  it("allows setting lastTextChannelId to undefined", () => {
    const player = new GuildPlayer("guild-1", "channel-1", new StubProvider(), () => {});
    player.lastTextChannelId = "channel-123";
    player.lastTextChannelId = undefined;
    expect(player.lastTextChannelId).toBeUndefined();
  });

  it("resets the now-playing idle flag when a card is (re)assigned", () => {
    const player = new GuildPlayer("guild-1", "channel-1", new StubProvider(), () => {});
    player.nowPlayingIdle = true;
    expect(player.nowPlayingIdle).toBe(true);

    player.setNowPlayingMessage(undefined);
    expect(player.nowPlayingIdle).toBe(false);
  });
});

describe("peekNextTrack", () => {
  const requestedBy = { id: "user", username: "Tester" };
  const a: Track = { id: "a", title: "A", webpageUrl: "https://youtube.com/watch?v=a", provider: "youtube", requestedBy };
  const b: Track = { id: "b", title: "B", webpageUrl: "https://youtube.com/watch?v=b", provider: "youtube", requestedBy };

  it("prefers the next queued song in normal mode", () => {
    expect(peekNextTrack(a, [b], "off")).toBe(b);
  });

  it("preloads the repeating song in track loop mode", () => {
    expect(peekNextTrack(a, [b], "track")).toBe(a);
  });

  it("preloads the queue head in queue loop mode", () => {
    expect(peekNextTrack(a, [b], "queue")).toBe(b);
    expect(peekNextTrack(a, [], "queue")).toBe(a);
  });

  it("never guesses an autoplay song when the queue is empty", () => {
    expect(peekNextTrack(a, [], "off")).toBeUndefined();
  });
});
