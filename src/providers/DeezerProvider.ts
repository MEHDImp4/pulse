import type { RequestedBy, Track, TrackProvider } from "../music/Track";
import { fetchJson } from "../utils/http";
import { asString } from "../utils/strings";
import { MetadataProvider } from "./MetadataProvider";
import { mapPlaylistSongs, playlistId } from "./playlistImport";
import type { PlaylistResult } from "./AudioProvider";

interface DeezerTrack {
  title?: string;
  duration?: number;
  artist?: { name?: string };
}

function isDeezerUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "deezer.com" || host.endsWith(".deezer.com");
  } catch {
    return false;
  }
}

export function extractDeezerTrackId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/track\/(\d+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export class DeezerProvider extends MetadataProvider {
  readonly name = "deezer" as TrackProvider;

  supports(url: string): boolean {
    return isDeezerUrl(url);
  }

  async resolvePlaylist(url: string, requestedBy: RequestedBy, limit = 50): Promise<PlaylistResult> {
    const id = playlistId(url, "deezer");
    if (!id) throw new Error("Lien de playlist Deezer invalide.");
    const payload = await fetchJson(`https://api.deezer.com/playlist/${id}/tracks?limit=${Math.min(100, limit)}&index=0`) as {
      data?: Array<{ title?: string; artist?: { name?: string } }>;
      error?: { message?: string };
    };
    if (payload.error) throw new Error(payload.error.message ?? "Playlist Deezer inaccessible.");
    const songs = (payload.data ?? []).flatMap((item) => {
      const title = asString(item.title);
      return title ? [{ title, artist: asString(item.artist?.name) }] : [];
    });
    return {
      title: "Playlist Deezer",
      tracks: await mapPlaylistSongs(songs, requestedBy, this.searcher, limit),
    };
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    const id = extractDeezerTrackId(url);
    if (!id) throw new Error("Lien Deezer non reconnu (morceau attendu).");

    const payload = (await fetchJson(`https://api.deezer.com/track/${id}`)) as DeezerTrack;
    const title = asString(payload.title);
    if (!title) throw new Error("Métadonnées Deezer introuvables.");

    const artist = asString(payload.artist?.name);
    const query = artist ? `${artist} ${title}` : title;
    return this.searchOnYouTube(query, requestedBy);
  }
}
