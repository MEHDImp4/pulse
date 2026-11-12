import type { RequestedBy, Track, TrackProvider } from "../music/Track";
import { fetchJson } from "../utils/http";
import { asString } from "../utils/strings";
import { MetadataProvider } from "./MetadataProvider";
import { mapPlaylistSongs, playlistId } from "./playlistImport";
import type { PlaylistResult } from "./AudioProvider";

interface ITunesLookup {
  results?: Array<{ trackName?: string; artistName?: string }>;
}

function isAppleMusicUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "music.apple.com";
  } catch {
    return false;
  }
}

export function extractAppleTrackId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("i");
    if (fromQuery && /^\d+$/.test(fromQuery)) return fromQuery;
    const match = url.pathname.match(/\/(\d+)$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export class AppleMusicProvider extends MetadataProvider {
  readonly name = "apple" as TrackProvider;
  constructor(
    searcher: MetadataProvider["searcher"],
    private readonly developerToken?: string,
    private readonly storefront = "us",
  ) {
    super(searcher);
  }

  supports(url: string): boolean {
    return isAppleMusicUrl(url);
  }

  async resolvePlaylist(url: string, requestedBy: RequestedBy, limit = 50): Promise<PlaylistResult> {
    const id = playlistId(url, "apple");
    if (!id) throw new Error("Lien de playlist Apple Music invalide.");
    if (!this.developerToken) {
      throw new Error("Import Apple Music : configure APPLE_MUSIC_DEVELOPER_TOKEN pour les playlists du catalogue.");
    }
    const payload = await fetchJson(
      `https://api.music.apple.com/v1/catalog/${this.storefront}/playlists/${encodeURIComponent(id)}/tracks?limit=${Math.min(100, limit)}`,
      { headers: { Authorization: `Bearer ${this.developerToken}` } },
    ) as { data?: Array<{ attributes?: { name?: string; artistName?: string } }> };
    const songs = (payload.data ?? []).flatMap((item) => {
      const title = asString(item.attributes?.name);
      return title ? [{ title, artist: asString(item.attributes?.artistName) }] : [];
    });
    return { title: "Playlist Apple Music", tracks: await mapPlaylistSongs(songs, requestedBy, this.searcher, limit) };
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    const id = extractAppleTrackId(url);
    if (!id) throw new Error("Lien Apple Music non reconnu (morceau attendu).");

    const payload = (await fetchJson(`https://itunes.apple.com/lookup?id=${id}`)) as ITunesLookup;
    const result = Array.isArray(payload.results) ? payload.results[0] : undefined;
    const title = asString(result?.trackName);
    if (!result || !title) throw new Error("Métadonnées Apple Music introuvables.");

    const artist = asString(result.artistName);
    const query = artist ? `${artist} ${title}` : title;
    return this.searchOnYouTube(query, requestedBy);
  }
}
