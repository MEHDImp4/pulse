import { describe, expect, it, vi } from "vitest";
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
  it("reserves a guild atomically while joining a voice session", () => {
    const manager = new PlayerManager(new StubProvider());
    const release = manager.reservePlaybackStart("guild-a", "chan-1");
    expect(release).toBeTypeOf("function");
    expect(manager.reservePlaybackStart("guild-a", "chan-2")).toBeUndefined();
    expect(manager.reservePlaybackStart("guild-a", "chan-1")).toBeUndefined();
    const other = manager.reservePlaybackStart("guild-b", "chan-2");
    expect(other).toBeTypeOf("function");
    release?.();
    release?.(); // idempotent
    expect(manager.reservePlaybackStart("guild-a", "chan-2")).toBeTypeOf("function");
    other?.();
  });

  it("admits simultaneous commands FIFO within one guild", async () => {
    const manager = new PlayerManager(new StubProvider());
    const first = await manager.waitForPlaybackStart("guild-a", "chan-1");
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;

    const order: number[] = [];
    const second = manager.waitForPlaybackStart("guild-a", "chan-1").then((result) => {
      order.push(2);
      return result;
    });
    const third = manager.waitForPlaybackStart("guild-a", "chan-1").then((result) => {
      order.push(3);
      return result;
    });
    const otherGuild = await manager.waitForPlaybackStart("guild-b", "chan-2");
    expect(otherGuild.status).toBe("ok");

    first.release();
    const next = await second;
    expect(next.status).toBe("ok");
    expect(order).toEqual([2]);
    if (next.status !== "ok") return;

    next.release();
    const last = await third;
    expect(last.status).toBe("ok");
    expect(order).toEqual([2, 3]);
    if (last.status === "ok") last.release();
    if (otherGuild.status === "ok") otherGuild.release();
  });

  it("drops timed-out waiters and does not leave a guild locked", async () => {
    vi.useFakeTimers();
    try {
      const manager = new PlayerManager(new StubProvider());
      const first = await manager.waitForPlaybackStart("guild-a", "chan-1");
      expect(first.status).toBe("ok");
      const timedOut = manager.waitForPlaybackStart("guild-a", "chan-1");
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await timedOut).status).toBe("timeout");
      if (first.status !== "ok") return;
      first.release();
      const retry = await manager.waitForPlaybackStart("guild-a", "chan-1");
      expect(retry.status).toBe("ok");
      if (retry.status === "ok") retry.release();
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds queued playback requests instead of allowing unlimited load", async () => {
    vi.useFakeTimers();
    try {
      const manager = new PlayerManager(new StubProvider());
      const first = await manager.waitForPlaybackStart("guild-a", "chan-1");
      const queued = Array.from({ length: 12 }, () => manager.waitForPlaybackStart("guild-a", "chan-1"));
      expect((await manager.waitForPlaybackStart("guild-a", "chan-1")).status).toBe("busy");
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await Promise.all(queued)).map((result) => result.status)).toEqual(Array(12).fill("timeout"));
      if (first.status === "ok") first.release();
    } finally {
      vi.useRealTimers();
    }
  });

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

  it("keeps the guild index in sync after destroying a session", async () => {
    const manager = new PlayerManager(new StubProvider());
    manager.getOrCreate("guild-a", "chan-1");
    manager.getOrCreate("guild-a", "chan-2");
    manager.getOrCreate("guild-b", "chan-3");
    await manager.destroy("guild-a", "chan-1");
    expect(manager.getForGuild("guild-a").map((p) => p.channelId)).toEqual(["chan-2"]);
    expect(manager.getForGuild("guild-b")).toHaveLength(1);
    await manager.destroyAll();
    expect(manager.getForGuild("guild-a")).toEqual([]);
    expect(manager.getForGuild("guild-b")).toEqual([]);
  });

  it("evicts a stale destination when moving an active session to its channel", async () => {
    const manager = new PlayerManager(new StubProvider());
    const first = manager.getOrCreate("guild-a", "chan-1");
    const stale = manager.getOrCreate("guild-a", "chan-2");
    expect(manager.rebind("guild-a", "chan-1", "chan-2")).toBe(first);
    expect(manager.get("guild-a", "chan-1")).toBeUndefined();
    expect(manager.get("guild-a", "chan-2")).toBe(first);
    expect(manager.getForGuild("guild-a")).toEqual([first]);
    expect(manager.getForGuild("guild-a")).not.toContain(stale);
    await stale.destroy();
    expect(manager.getForGuild("guild-a")).toEqual([first]);
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
