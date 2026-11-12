import type { RequestedBy, Track } from "../music/Track";
import type { AudioProvider } from "./AudioProvider";

export function playlistId(url: string, service: "spotify" | "deezer" | "apple"): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const valid = service === "spotify"
      ? host === "open.spotify.com"
      : service === "deezer"
        ? host === "deezer.com" || host.endsWith(".deezer.com")
        : host === "music.apple.com";
    if (!valid) return undefined;
    const pattern = service === "deezer" ? /\/playlist\/(\d+)(?:\/|$)/ : /\/playlist\/[^/]*\/?([A-Za-z0-9._-]+)(?:\/|$)/;
    if (service === "spotify") {
      const id = parsed.pathname.match(/\/playlist\/([A-Za-z0-9]+)(?:\/|$)/)?.[1];
      return id;
    }
    if (service === "apple") {
      const id = parsed.pathname.match(/\/playlist\/[^/]+\/([A-Za-z0-9._-]+)(?:\/|$)/)?.[1];
      return id;
    }
    return parsed.pathname.match(pattern)?.[1];
  } catch {
    return undefined;
  }
}

export interface PlaylistSong {
  title: string;
  artist?: string;
}

/** Limit lookup fan-out and preserve order; skip unavailable tracks gracefully. */
export async function mapPlaylistSongs(
  songs: readonly PlaylistSong[], requestedBy: RequestedBy, searcher: AudioProvider, limit: number,
): Promise<Track[]> {
  const capped = songs.slice(0, Math.max(0, Math.min(limit, 100)));
  const results: Array<Track | undefined> = new Array(capped.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, capped.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= capped.length) return;
      const song = capped[i];
      try {
        results[i] = await searcher.search([song.artist, song.title].filter(Boolean).join(" "), requestedBy);
      } catch {
        // A deleted or region-restricted track should not abort the playlist.
      }
    }
  }));
  return results.filter((track): track is Track => track !== undefined);
}
