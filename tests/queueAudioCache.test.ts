import { mkdtemp, readdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueueAudioCache } from "../src/audio/QueueAudioCache";
import type { Track } from "../src/music/Track";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";

const dirs: string[] = [];
const caches: QueueAudioCache[] = [];
const requestedBy = { id: "u", username: "Test" };
const track = (id: string, provider: Track["provider"] = "youtube"): Track => ({
  id, title: id, provider, webpageUrl: "https://youtube.com/watch?v=" + id, requestedBy,
  duration: 120, isLive: provider === "radio",
});
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

class FixtureProvider implements AudioProvider {
  readonly name = "youtube" as const;
  readonly calls: string[] = [];
  readonly payloads = new Map<string, Buffer>();
  readonly createSource = vi.fn(async (song: Track): Promise<AudioSource> => {
    this.calls.push(song.id);
    const bytes = this.payloads.get(song.id) ?? Buffer.from("compressed-" + song.id);
    const proc = spawn(process.execPath, [
      "-e", "process.stdout.write(Buffer.from(process.argv[1], 'base64'))",
      bytes.toString("base64"),
    ], { stdio: ["ignore", "pipe", "ignore"] });
    return { kind: "pipe", stream: proc.stdout!, process: proc };
  });
  supports(): boolean { return true; }
  async search(): Promise<Track> { return track("result"); }
  async resolve(): Promise<Track> { return track("result"); }
}

async function makeCache(provider: AudioProvider, overrides: Partial<ConstructorParameters<typeof QueueAudioCache>[2]> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "pulse-queuecache-"));
  dirs.push(dir);
  const cache = new QueueAudioCache(provider, dir, {
    maxBytes: 1024 * 1024,
    maxTrackBytes: 1024 * 1024,
    concurrency: 2,
    downloadTimeoutMs: 5_000,
    ...overrides,
  });
  caches.push(cache);
  return { cache, dir };
}

async function untilCached(cache: QueueAudioCache, song: Track): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const cached = await cache.pathFor(song);
    if (cached) return cached;
    await tick();
  }
  throw new Error("Cache did not fill for " + song.id);
}

afterEach(async () => {
  for (const cache of caches.splice(0)) cache.close();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("QueueAudioCache", () => {
  it("downloads every queued song, not just the immediate successor", async () => {
    const provider = new FixtureProvider();
    const { cache } = await makeCache(provider);
    const songs = ["a", "b", "c", "d", "e"].map((id) => track(id));
    cache.setQueue("guild", songs);
    const files = await Promise.all(songs.map((song) => untilCached(cache, song)));
    expect(new Set(files).size).toBe(5);
    expect(new Set(provider.calls)).toEqual(new Set(songs.map((song) => song.id)));
    expect((await readFile(files[3])).toString()).toBe("compressed-d");
  });

  it("deduplicates the same track across two guilds", async () => {
    const provider = new FixtureProvider();
    const { cache } = await makeCache(provider);
    const same = track("shared");
    cache.setQueue("one", [same]);
    cache.setQueue("two", [same]);
    await untilCached(cache, same);
    expect(provider.calls).toEqual(["shared"]);
  });

  it("skips live radio streams and never caches URLs outside the supported sources", async () => {
    const provider = new FixtureProvider();
    const { cache } = await makeCache(provider);
    cache.setQueue("guild", [track("live", "radio"), track("next", "youtube")]);
    await untilCached(cache, track("next"));
    expect(provider.calls).toEqual(["next"]);
    expect(await cache.pathFor(track("live", "radio"))).toBeUndefined();
  });

  it("respects per-file disk limits and leaves no partial files", async () => {
    const provider = new FixtureProvider();
    provider.payloads.set("huge", Buffer.alloc(12_000));
    const { cache, dir } = await makeCache(provider, { maxTrackBytes: 1_000 });
    cache.setQueue("guild", [track("huge")]);
    for (let i = 0; i < 100 && (await readdir(dir)).some((f) => f.endsWith(".part")); i++) await tick();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await cache.pathFor(track("huge"))).toBeUndefined();
    expect((await readdir(dir)).filter((file) => file.endsWith(".part"))).toHaveLength(0);
  });

  it("reuses completed downloads from disk on a later process instance", async () => {
    const provider = new FixtureProvider();
    const { cache, dir } = await makeCache(provider);
    const a = track("reuse");
    cache.setQueue("guild", [a]);
    const path = await untilCached(cache, a);
    cache.close();

    const next = new QueueAudioCache(provider, dir, {
      maxBytes: 1024 * 1024, maxTrackBytes: 1024 * 1024, concurrency: 1,
    });
    caches.push(next);
    expect(await next.pathFor(a)).toBe(path);
    expect(provider.calls).toEqual(["reuse"]);
  });

  it("invalidates a corrupt file so playback can revert to streaming", async () => {
    const provider = new FixtureProvider();
    const { cache } = await makeCache(provider);
    const a = track("corrupt");
    cache.setQueue("guild", [a]);
    await untilCached(cache, a);
    cache.invalidate(a);
    expect(await cache.pathFor(a)).toBeUndefined();
  });
});
