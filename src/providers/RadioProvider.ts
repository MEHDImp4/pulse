import { env } from "../config/env";
import type { RequestedBy, Track, TrackProvider } from "../music/Track";
import { isSafeRemoteUrl, lookupHost, type HostResolver } from "../utils/net";
import { openSafeRadioStream } from "./SafeRadioStream";
import type { AudioProvider, AudioSource } from "./AudioProvider";

export function deriveRadioTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    const name = last ? decodeURIComponent(last) : parsed.hostname;
    return `${name} — ${parsed.hostname}`;
  } catch {
    return url;
  }
}

/**
 * Plays direct HTTP(S) audio streams (Icecast/radio). Used as a fallback for
 * any http URL not claimed by a more specific provider. Public hosts only:
 * internal/loopback targets are refused to prevent SSRF. An optional
 * `RADIO_ALLOWED_HOSTS` allowlist can further lock playback down.
 */
export class RadioProvider implements AudioProvider {
  readonly name = "radio" as TrackProvider;

  constructor(
    private readonly resolveHost: HostResolver = lookupHost,
    private readonly allowedHosts: readonly string[] = env.radioAllowedHosts,
  ) {}

  supports(url: string): boolean {
    return isSafeRemoteUrl(url, this.allowedHosts);
  }

  async search(): Promise<Track> {
    throw new Error("La recherche n'est pas supportée pour les flux radio.");
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    return {
      id: url,
      title: deriveRadioTitle(url),
      webpageUrl: url,
      requestedBy,
      provider: "radio",
      isLive: true,
    };
  }

  async createSource(track: Track): Promise<AudioSource> {
    const source = await openSafeRadioStream(track.webpageUrl, {
      allowedHosts: this.allowedHosts,
      resolveHost: this.resolveHost,
    });
    return { kind: "stream", ...source };
  }
}
