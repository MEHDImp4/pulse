import { describe, expect, it } from "vitest";
import type { RequestedBy, Track } from "../src/music/Track";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";
import { PlayerManager } from "../src/music/PlayerManager";

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

describe("PlayerManager", () => {
  it("returns one player per guild+channel and isolates sessions", () => {
    const manager = new PlayerManager(new StubProvider());
    const a1 = manager.getOrCreate("guild-a", "chan-1");
    const a1again = manager.getOrCreate("guild-a", "chan-1");
    const a2 = manager.getOrCreate("guild-a", "chan-2");
    const b = manager.getOrCreate("guild-b", "chan-1");

    expect(a1).toBe(a1again);
    expect(a1).not.toBe(a2);
    expect(a1).not.toBe(b);
    expect(manager.size).toBe(3);
  });

  it("resolves players by guild and channel", () => {
    const manager = new PlayerManager(new StubProvider());
    const a1 = manager.getOrCreate("guild-a", "chan-1");
    manager.getOrCreate("guild-a", "chan-2");
    manager.getOrCreate("guild-b", "chan-1");

    expect(manager.get("guild-a", "chan-1")).toBe(a1);
    expect(manager.get("guild-a", "missing")).toBeUndefined();
    expect(manager.get("guild-b", "chan-1")?.guildId).toBe("guild-b");
  });

  it("lists the sessions of a guild (internal map; only one is ever connected)", () => {
    const manager = new PlayerManager(new StubProvider());
    manager.getOrCreate("guild-a", "chan-1");
    manager.getOrCreate("guild-a", "chan-2");
    manager.getOrCreate("guild-b", "chan-1");

    expect(manager.getForGuild("guild-a")).toHaveLength(2);
    expect(manager.getForGuild("guild-b")).toHaveLength(1);
    expect(manager.getForGuild("guild-c")).toEqual([]);
  });

  it("finds a player by its voice channel", () => {
    const manager = new PlayerManager(new StubProvider());
    const a1 = manager.getOrCreate("guild-a", "chan-1");

    expect(manager.getForChannel("chan-1")).toBe(a1);
    expect(manager.getForChannel("chan-x")).toBeUndefined();
  });

  it("rebinds a session when the bot is moved to another channel", () => {
    const manager = new PlayerManager(new StubProvider());
    const player = manager.getOrCreate("guild-a", "chan-1");

    const rebound = manager.rebind("guild-a", "chan-1", "chan-2");

    expect(rebound).toBe(player);
    expect(player.channelId).toBe("chan-2");
    expect(manager.get("guild-a", "chan-1")).toBeUndefined();
    expect(manager.get("guild-a", "chan-2")).toBe(player);
    expect(manager.size).toBe(1);
  });

  it("returns the session already bound to the target channel on rebind", () => {
    const manager = new PlayerManager(new StubProvider());
    const player = manager.getOrCreate("guild-a", "chan-2");

    expect(manager.rebind("guild-a", "chan-1", "chan-2")).toBe(player);
  });

  it("rebind is a no-op when the source session is unknown", () => {
    const manager = new PlayerManager(new StubProvider());
    expect(manager.rebind("guild-a", "missing", "chan-2")).toBeUndefined();
  });

  it("resolves text searches through the provider", async () => {
    const manager = new PlayerManager(new StubProvider());
    const result = await manager.resolveTrack("hello", { id: "1", username: "Tester" });
    expect(result.title).toBe("hello");
  });

  it("activeGuildIds returns empty array when no players exist", () => {
    const manager = new PlayerManager(new StubProvider());
    expect(manager.activeGuildIds).toEqual([]);
  });

  it("activeGuildIds dedupes guilds of connected players", () => {
    const manager = new PlayerManager(new StubProvider());
    manager.getOrCreate("guild-a", "chan-1");
    manager.getOrCreate("guild-a", "chan-2");
    manager.getOrCreate("guild-b", "chan-1");
    // Players are not connected (no voice channel joined), so this stays empty.
    expect(manager.activeGuildIds).toEqual([]);
  });
});
