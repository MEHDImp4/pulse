import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Track } from "./Track";

export interface SavedSong {
  title: string;
  url: string;
  artist?: string;
}

interface LibraryData {
  version: 1;
  favorites: Record<string, SavedSong[]>;
  playlists: Record<string, Record<string, SavedSong[]>>;
}

const MAX_FAVORITES = 100;
const MAX_LISTS = 20;
const MAX_TRACKS = 100;
const MAX_NAME = 40;

export function toSavedSong(track: Track): SavedSong {
  return {
    title: track.title.slice(0, 200),
    url: track.webpageUrl.slice(0, 2048),
    artist: track.author?.slice(0, 120),
  };
}

function validSong(value: unknown): value is SavedSong {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<SavedSong>;
  if (typeof song.title !== "string" || !song.title || song.title.length > 200 ||
      typeof song.url !== "string" || song.url.length > 2048) return false;
  try {
    const url = new URL(song.url);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validPlaylistName(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && value.length <= MAX_NAME &&
    !["__proto__", "constructor", "prototype"].includes(name.toLowerCase()) &&
    !/[\u0000-\u001f]/.test(value);
}

export class PersonalLibrary {
  private data: LibraryData = { version: 1, favorites: {}, playlists: {} };

  constructor(private readonly path: string) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LibraryData>;
      if (parsed.version === 1) {
        for (const [uid, songs] of Object.entries(parsed.favorites ?? {})) {
          if (Array.isArray(songs)) this.data.favorites[uid] = songs.filter(validSong).slice(0, MAX_FAVORITES);
        }
        for (const [uid, lists] of Object.entries(parsed.playlists ?? {})) {
          if (!lists || typeof lists !== "object") continue;
          const safe: Record<string, SavedSong[]> = {};
          for (const [name, songs] of Object.entries(lists).slice(0, MAX_LISTS)) {
            if (validPlaylistName(name) && Array.isArray(songs)) {
              safe[name] = songs.filter(validSong).slice(0, MAX_TRACKS);
            }
          }
          this.data.playlists[uid] = safe;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Unable to read music library; refusing to overwrite it");
      }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(this.data), { encoding: "utf8", mode: 0o600 });
      renameSync(tmp, this.path);
    } catch (error) {
      try { unlinkSync(tmp); } catch { /* no temporary file */ }
      throw error;
    }
  }

  favorites(userId: string): SavedSong[] {
    return [...(this.data.favorites[userId] ?? [])];
  }

  addFavorite(userId: string, track: Track): boolean {
    const list = this.data.favorites[userId] ?? [];
    const song = toSavedSong(track);
    if (!validSong(song) || list.some((item) => item.url === song.url)) return false;
    if (list.length >= MAX_FAVORITES) throw new Error("Maximum 100 favoris.");
    list.push(song);
    this.data.favorites[userId] = list;
    this.save();
    return true;
  }

  removeFavorite(userId: string, position: number): SavedSong | undefined {
    const list = this.data.favorites[userId];
    if (!list || !Number.isInteger(position) || position < 1 || position > list.length) return undefined;
    const [removed] = list.splice(position - 1, 1);
    this.save();
    return removed;
  }

  playlists(userId: string): Array<{ name: string; count: number }> {
    return Object.entries(this.data.playlists[userId] ?? {}).map(([name, songs]) => ({ name, count: songs.length }));
  }

  playlist(userId: string, name: string): SavedSong[] | undefined {
    const songs = this.data.playlists[userId]?.[name];
    return songs ? [...songs] : undefined;
  }

  savePlaylist(userId: string, name: string, tracks: readonly Track[]): number {
    if (!validPlaylistName(name)) throw new Error("Nom invalide (1-40 caractères).");
    if (!tracks.length) throw new Error("Aucune musique à sauvegarder.");
    const lists = this.data.playlists[userId] ?? {};
    if (!Object.hasOwn(lists, name) && Object.keys(lists).length >= MAX_LISTS) {
      throw new Error("Maximum 20 playlists par utilisateur.");
    }
    const songs = tracks.slice(0, MAX_TRACKS).map(toSavedSong).filter(validSong);
    if (!songs.length) throw new Error("Aucune URL musicale valide.");
    lists[name] = songs;
    this.data.playlists[userId] = lists;
    this.save();
    return songs.length;
  }

  removePlaylist(userId: string, name: string): boolean {
    const lists = this.data.playlists[userId];
    if (!lists || !Object.hasOwn(lists, name)) return false;
    delete lists[name];
    this.save();
    return true;
  }
}
