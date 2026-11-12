import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersonalLibrary } from "../src/music/PersonalLibrary";
import type { Track } from "../src/music/Track";

const dirs: string[] = [];
const track: Track = {
  id: "yt", title: "Favorite Song", webpageUrl: "https://youtube.com/watch?v=yt",
  provider: "youtube", requestedBy: { id: "u1", username: "First" },
};
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "pulse-favorites-"));
  dirs.push(dir);
  return join(dir, "library.json");
};
afterEach(() => { dirs.splice(0).forEach((dir) => rmSync(dir, { force: true, recursive: true })); });

describe("PersonalLibrary", () => {
  it("persists favorites, enforces deduplication and user isolation", () => {
    const path = make();
    const db = new PersonalLibrary(path);
    expect(db.addFavorite("u1", track)).toBe(true);
    expect(db.addFavorite("u1", track)).toBe(false);
    expect(db.favorites("u2")).toEqual([]);
    expect(new PersonalLibrary(path).favorites("u1")).toEqual([{ title: "Favorite Song", url: track.webpageUrl }]);
    expect(db.removeFavorite("u1", 1)?.title).toBe("Favorite Song");
    expect(db.favorites("u1")).toHaveLength(0);
  });
  it("stores and loads named playlists without sharing between users", () => {
    const path = make();
    const db = new PersonalLibrary(path);
    expect(db.savePlaylist("u1", "Chill", [track, track])).toBe(2);
    expect(db.playlists("u1")).toEqual([{ name: "Chill", count: 2 }]);
    expect(db.playlist("u2", "Chill")).toBeUndefined();
    expect(new PersonalLibrary(path).playlist("u1", "Chill")).toHaveLength(2);
    expect(db.removePlaylist("u1", "Chill")).toBe(true);
    expect(db.playlists("u1")).toEqual([]);
  });
  it("rejects empty playlists and invalid names", () => {
    const db = new PersonalLibrary(make());
    expect(() => db.savePlaylist("u", "", [track])).toThrow();
    expect(() => db.savePlaylist("u", "__proto__", [track])).toThrow();
    expect(() => db.savePlaylist("u", "constructor", [track])).toThrow();
    expect(() => db.savePlaylist("u", "Valid", [])).toThrow();
  });
});
