import type { RequestedBy, Track, TrackProvider } from "../music/Track";
import { fetchJson } from "../utils/http";
import { logger } from "../utils/logger";
import { asNumber, asString } from "../utils/strings";
import { MetadataProvider } from "./MetadataProvider";
import { mapPlaylistSongs, playlistId } from "./playlistImport";
import type { PlaylistResult } from "./AudioProvider";

interface SpotifyTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface SpotifyTrack {
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
}

function isSpotifyUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "open.spotify.com" || host.endsWith(".spotify.com");
  } catch {
    return false;
  }
}

export function extractSpotifyTrackId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/track\/([A-Za-z0-9]+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export class SpotifyProvider extends MetadataProvider {
  readonly name = "spotify" as TrackProvider;
  private token?: { value: string; expiresAt: number };
  private tokenPromise?: Promise<string>;
  private userToken?: { value: string; expiresAt: number };
  private userTokenPromise?: Promise<string>;

  constructor(
    searcher: MetadataProvider["searcher"],
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken?: string,
  ) {
    super(searcher);
  }

  supports(url: string): boolean {
    return isSpotifyUrl(url);
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    const id = extractSpotifyTrackId(url);
    if (!id) throw new Error("Lien Spotify non reconnu (morceau attendu).");

    const token = await this.getToken();
    const payload = (await fetchJson(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })) as SpotifyTrack;

    const title = asString(payload.name);
    if (!title) throw new Error("Métadonnées Spotify introuvables.");

    const artists = Array.isArray(payload.artists)
      ? payload.artists
          .map((artist) => asString(artist?.name))
          .filter((name): name is string => name !== undefined)
          .join(" ")
      : "";
    return this.searchOnYouTube(artists ? `${artists} ${title}` : title, requestedBy);
  }

  async resolvePlaylist(url: string, requestedBy: RequestedBy, limit = 50): Promise<PlaylistResult> {
    const id = playlistId(url, "spotify");
    if (!id) throw new Error("Lien de playlist Spotify invalide.");
    if (!this.refreshToken) {
      throw new Error("Spotify exige un OAuth utilisateur pour les playlists. Configure SPOTIFY_REFRESH_TOKEN avec un compte propriétaire/collaborateur.");
    }
    const token = await this.getUserToken();
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const payload = await fetchJson(
        `https://api.spotify.com/v1/playlists/${id}/items?limit=${Math.min(50, limit)}&offset=0`,
        { headers },
      ) as { items?: Array<{ item?: SpotifyTrack; track?: SpotifyTrack }> };
      const songs = (payload.items ?? []).map((item) => item.item ?? item.track).flatMap((track) => {
        const title = asString(track?.name);
        if (!title) return [];
        const artist = track?.artists?.map((a) => asString(a.name)).filter(Boolean).join(" ");
        return [{ title, artist }];
      });
      const tracks = await mapPlaylistSongs(songs, requestedBy, this.searcher, limit);
      return { title: "Playlist Spotify", tracks };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("403")) {
        throw new Error("Spotify autorise uniquement les playlists dont ce compte est propriétaire ou collaborateur.");
      }
      throw error;
    }
  }

  private async getUserToken(): Promise<string> {
    if (!this.refreshToken) throw new Error("SPOTIFY_REFRESH_TOKEN manquant");
    if (this.userToken && this.userToken.expiresAt > Date.now() + 30_000) return this.userToken.value;
    this.userTokenPromise ??= (async () => {
      const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
      const payload = await fetchJson("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refreshToken! }).toString(),
      }) as SpotifyTokenResponse;
      const value = asString(payload.access_token);
      if (!value) throw new Error("Échec du renouvellement OAuth Spotify.");
      this.userToken = { value, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
      return value;
    })().finally(() => { this.userTokenPromise = undefined; });
    return this.userTokenPromise;
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }

    // Memoize the in-flight refresh so concurrent calls share one token request.
    this.tokenPromise ??= this.refreshToken().finally(() => {
      this.tokenPromise = undefined;
    });
    return this.tokenPromise;
  }

  private async refreshToken(): Promise<string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const payload = (await fetchJson("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })) as SpotifyTokenResponse;

    const accessToken = asString(payload.access_token);
    if (!accessToken) throw new Error("Authentification Spotify échouée.");

    const expiresIn = asNumber(payload.expires_in);
    const ttlSeconds = expiresIn !== undefined && expiresIn > 0 ? Math.min(expiresIn, 86_400) : 3600;

    this.token = {
      value: accessToken,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };
    logger.debug("Refreshed Spotify access token");
    return this.token.value;
  }
}
