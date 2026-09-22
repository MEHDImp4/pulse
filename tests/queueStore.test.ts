import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { QueueStore, sanitizePersistedQueue } from "../src/music/QueueStore";
import type { Track } from "../src/music/Track";

function track(id: string): Track {
  return {
    id,
    title: `Title ${id}`,
    webpageUrl: `https://www.youtube.com/watch?v=${id}`,
    duration: 120,
    author: "Artist",
    requestedBy: { id: "u1", username: "Tester" },
    provider: "youtube",
  };
}

describe("sanitizePersistedQueue", () => {
  it("keeps valid tracks and drops invalid ones", () => {
    const result = sanitizePersistedQueue({
      guildId: "g1",
      channelId: "c1",
      current: track("a"),
      tracks: [track("b"), { id: 1 }, null],
      savedAt: 123,
    });

    expect(result?.guildId).toBe("g1");
    expect(result?.channelId).toBe("c1");
    expect(result?.current?.id).toBe("a");
    expect(result?.tracks.map((item) => item.id)).toEqual(["b"]);
    expect(result?.savedAt).toBe(123);
  });

  it("rejects entries without ids", () => {
    expect(sanitizePersistedQueue({ tracks: [] })).toBeUndefined();
    expect(sanitizePersistedQueue(null)).toBeUndefined();
  });
});

describe("QueueStore", () => {
  const dirs: string[] = [];

  function tempFile(): string {
    const dir = mkdtempSync(join(tmpdir(), "pulse-queues-"));
    dirs.push(dir);
    return join(dir, "queues.json");
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("persists and reloads sessions", () => {
    const file = tempFile();
    const store = new QueueStore(file, 0);
    store.set("g1:c1", {
      guildId: "g1",
      channelId: "c1",
      textChannelId: "t1",
      current: track("a"),
      tracks: [track("b")],
    });
    store.flush();

    const reloaded = new QueueStore(file, 0);
    reloaded.load();
    const entry = reloaded.get("g1:c1");
    expect(entry?.current?.id).toBe("a");
    expect(entry?.tracks.map((item) => item.id)).toEqual(["b"]);
    expect(entry?.textChannelId).toBe("t1");
  });

  it("exposes a snapshot of its entries", () => {
    const store = new QueueStore(tempFile(), 0);
    store.set("g1:c1", { guildId: "g1", channelId: "c1", tracks: [track("a")] });
    expect(store.entries().map(([sessionId]) => sessionId)).toEqual(["g1:c1"]);
  });

  it("deletes removed sessions", () => {
    const file = tempFile();
    const store = new QueueStore(file, 0);
    store.set("g1:c1", { guildId: "g1", channelId: "c1", tracks: [track("a")] });
    store.delete("g1:c1");
    store.flush();

    const reloaded = new QueueStore(file, 0);
    reloaded.load();
    expect(reloaded.get("g1:c1")).toBeUndefined();
  });

  it("moves a persisted session to a new channel id", () => {
    const store = new QueueStore(tempFile(), 0);
    store.set("g1:c1", { guildId: "g1", channelId: "c1", tracks: [track("a")] });

    store.move("g1:c1", "g1:c2", "c2");

    expect(store.get("g1:c1")).toBeUndefined();
    expect(store.get("g1:c2")?.channelId).toBe("c2");
    expect(store.entries().map(([sessionId]) => sessionId)).toEqual(["g1:c2"]);
  });

  it("starts fresh when the file is missing", () => {
    const store = new QueueStore(tempFile(), 0);
    store.load();
    expect(store.get("g1:c1")).toBeUndefined();
  });
});
