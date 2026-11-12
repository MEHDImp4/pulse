import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ListeningStats } from "../src/music/ListeningStats";
import type { Track } from "../src/music/Track";

const song = (id: string, author: string): Track => ({
  id, title: `Song ${id}`, author, webpageUrl: "https://youtube.com/watch?v=abc",
  provider: "youtube", requestedBy: { id: "u", username: "User" },
});
describe("per-guild listening statistics", () => {
  it("isolates guilds and persists most-played songs/artists", () => {
    const dir = mkdtempSync(join(tmpdir(), "pulse-stats-"));
    try {
      const path = join(dir, "stats.json");
      const stats = new ListeningStats(path);
      stats.record("guild-a", song("1", "A"));
      stats.record("guild-a", song("1", "A"));
      stats.record("guild-a", song("2", "B"));
      stats.record("guild-b", song("3", "C"));
      stats.flush();
      const loaded = new ListeningStats(path);
      expect(loaded.get("guild-a").totalPlays).toBe(3);
      expect(loaded.get("guild-a").topSongs[0].plays).toBe(2);
      expect(loaded.get("guild-a").topArtists[0].artist).toBe("A");
      expect(loaded.get("guild-b").totalPlays).toBe(1);
      expect(loaded.get("guild-c").topSongs).toEqual([]);
    } finally { rmSync(dir, { force: true, recursive: true }); }
  });
});
