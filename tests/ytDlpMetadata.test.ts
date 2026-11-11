import { describe, expect, it, vi } from "vitest";
import type { RequestedBy } from "../src/music/Track";
import { YtDlpProvider } from "../src/providers/YtDlpProvider";

const info = { id: "abc", title: "Hello", webpage_url: "https://www.youtube.com/watch?v=abc" };
const user1: RequestedBy = { id: "u1", username: "User 1" };
const user2: RequestedBy = { id: "u2", username: "User 2" };

class FakeProvider extends YtDlpProvider {
  readonly name = "youtube" as const;
  protected readonly searchPrefix = "ytsearch";
  constructor(private readonly runner: (args: string[]) => Promise<{ stdout: string; stderr: string }>) {
    super();
  }
  protected isAllowedUrl(): boolean { return true; }
  protected override runMetadata(args: string[]) { return this.runner(args); }
}

describe("yt-dlp metadata optimisation", () => {
  it("shares overlapping searches but keeps each requester's identity", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const runner = vi.fn(async () => {
      await gate;
      return { stdout: JSON.stringify(info), stderr: "" };
    });
    const provider = new FakeProvider(runner);
    const a = provider.search(" same query ", user1);
    const b = provider.search("same query", user2);
    await Promise.resolve();
    expect(runner).toHaveBeenCalledTimes(1);
    release();
    const [trackA, trackB] = await Promise.all([a, b]);
    expect(trackA.requestedBy).toEqual(user1);
    expect(trackB.requestedBy).toEqual(user2);
    await provider.search("same query", user1);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("caches flat playlists by target and limit, not by requester", async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({ title: "Mix", entries: [info] }),
      stderr: "",
    }));
    const provider = new FakeProvider(runner);
    const a = await provider.resolvePlaylist("https://www.youtube.com/playlist?list=abc", user1, 3);
    const b = await provider.resolvePlaylist("https://www.youtube.com/playlist?list=abc", user2, 3);
    expect(a.tracks[0].requestedBy.id).toBe("u1");
    expect(b.tracks[0].requestedBy.id).toBe("u2");
    expect(runner).toHaveBeenCalledTimes(1);
    await provider.resolvePlaylist("https://www.youtube.com/playlist?list=abc", user2, 5);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("does not cache failed extractions", async () => {
    const runner = vi.fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ stdout: JSON.stringify(info), stderr: "" });
    const provider = new FakeProvider(runner);
    await expect(provider.search("hello", user1)).rejects.toThrow("network timeout");
    await expect(provider.search("hello", user1)).resolves.toMatchObject({ title: "Hello" });
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
