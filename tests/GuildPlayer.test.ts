import { describe, expect, it } from "vitest";
import type { RequestedBy, Track } from "../src/music/Track";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";
import { GuildPlayer } from "../src/music/GuildPlayer";

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
