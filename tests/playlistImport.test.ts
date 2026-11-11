import { describe, expect, it, vi } from "vitest";
import { playlistId, mapPlaylistSongs } from "../src/providers/playlistImport";
import type { AudioProvider } from "../src/providers/AudioProvider";

describe("playlist URL parser", () => {
  it("handles provider playlist URLs", () => {
    expect(playlistId("https://open.spotify.com/playlist/abc123?si=test", "spotify")).toBe("abc123");
    expect(playlistId("https://www.deezer.com/fr/playlist/123456789", "deezer")).toBe("123456789");
    expect(playlistId("https://music.apple.com/fr/playlist/my-list/pl.abc123", "apple")).toBe("pl.abc123");
  });
  it("rejects unrelated links and forged hosts", () => {
    expect(playlistId("https://evil.spotify.com/playlist/a", "spotify")).toBeUndefined();
    expect(playlistId("https://open.spotify.com/track/123", "spotify")).toBeUndefined();
    expect(playlistId("https://music.apple.com/fr/album/name/123", "apple")).toBeUndefined();
    expect(playlistId("http://localhost/playlist/123", "deezer")).toBeUndefined();
  });
});

describe("playlist song resolver", () => {
  it("retains original ordering and ownership while skipping missing tracks", async () => {
    const search = vi.fn(async (query: string, requestedBy: { id: string; username: string }) => {
      if (query === "B bad") throw new Error("not found");
      return { id: query, title: query, webpageUrl: "https://youtube.com/watch?v=test", provider: "youtube", requestedBy };
    });
    const provider = { search } as unknown as AudioProvider;
    const request = { id: "u", username: "User" };
    const tracks = await mapPlaylistSongs([{ title: "ok", artist: "A" }, { title: "bad", artist: "B" }, { title: "again", artist: "C" }], request, provider, 3);
    expect(tracks.map((track) => track.id)).toEqual(["A ok", "C again"]);
    expect(tracks.every((track) => track.requestedBy.id === "u")).toBe(true);
    expect(search).toHaveBeenCalledTimes(3);
  });
  it("honours import limit", async () => {
    const search = vi.fn(async () => ({ id: "test" }));
    await mapPlaylistSongs([{ title: "a" }, { title: "b" }], { id: "u", username: "U" }, { search } as unknown as AudioProvider, 1);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
