import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { env } from "../config/env";
import type { Track } from "./Track";

export interface TopSong {
  key: string;
  title: string;
  artist: string;
  plays: number;
}
export interface GuildListeningSnapshot {
  totalPlays: number;
  topSongs: TopSong[];
  topArtists: Array<{ artist: string; plays: number }>;
}

interface StoredGuild {
  totalPlays: number;
  songs: Record<string, TopSong>;
}

/** Persistent, guild-scoped usage statistics; no user IDs stored. */
export class ListeningStats {
  private readonly guilds = new Map<string, StoredGuild>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly path: string, private readonly debounceMs = 1000) {
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as { version?: number; guilds?: Record<string, StoredGuild> };
      if (parsed.version === 1 && parsed.guilds) {
        for (const [id, data] of Object.entries(parsed.guilds).slice(0, 1000)) {
          if (!data || !Number.isSafeInteger(data.totalPlays) || typeof data.songs !== "object") continue;
          const safe: Record<string, TopSong> = {};
          for (const [key, entry] of Object.entries(data.songs ?? {}).slice(0, 500)) {
            if (typeof entry?.title === "string" && typeof entry?.artist === "string" &&
                Number.isSafeInteger(entry?.plays) && entry.plays >= 0) {
              safe[key] = { key, title: entry.title.slice(0, 200), artist: entry.artist.slice(0, 120), plays: entry.plays };
            }
          }
          this.guilds.set(id, { totalPlays: data.totalPlays, songs: safe });
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Unable to read listening stats; refusing to overwrite them");
      }
    }
  }

  record(guildId: string, track: Track): void {
    const guild = this.guilds.get(guildId) ?? { totalPlays: 0, songs: {} };
    const key = `${track.provider}:${track.id}`;
    if (!Object.hasOwn(guild.songs, key) && Object.keys(guild.songs).length >= 500) {
      const least = Object.values(guild.songs).sort((a, b) => a.plays - b.plays)[0];
      if (least) delete guild.songs[least.key];
    }
    const prev = guild.songs[key];
    guild.songs[key] = {
      key, title: track.title.slice(0, 200), artist: (track.author ?? "Inconnu").slice(0, 120),
      plays: (prev?.plays ?? 0) + 1,
    };
    guild.totalPlays++;
    if (!this.guilds.has(guildId) && this.guilds.size >= 1000) {
      const oldest = this.guilds.keys().next().value;
      if (oldest) this.guilds.delete(oldest);
    }
    this.guilds.set(guildId, guild);
    if (!this.timer) {
      this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, this.debounceMs);
      this.timer.unref();
    }
  }

  get(guildId: string): GuildListeningSnapshot {
    const data = this.guilds.get(guildId);
    if (!data) return { totalPlays: 0, topSongs: [], topArtists: [] };
    const songs = Object.values(data.songs);
    const topSongs = songs.sort((a, b) => b.plays - a.plays).slice(0, 5);
    const artists = new Map<string, number>();
    for (const song of songs) artists.set(song.artist, (artists.get(song.artist) ?? 0) + song.plays);
    const topArtists = [...artists].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([artist, plays]) => ({ artist, plays }));
    return { totalPlays: data.totalPlays, topSongs, topArtists };
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, guilds: Object.fromEntries(this.guilds) }), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
}

export const listeningStats = new ListeningStats(join(env.dataDir, "listening-stats.json"));
