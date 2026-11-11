import { env } from "../config/env";
import { AppleMusicProvider } from "./AppleMusicProvider";
import type { AudioProvider } from "./AudioProvider";
import { DeezerProvider } from "./DeezerProvider";
import { RadioProvider } from "./RadioProvider";
import { SoundCloudProvider } from "./SoundCloudProvider";
import { SpotifyProvider } from "./SpotifyProvider";
import { ProviderRegistry } from "./ProviderRegistry";
import { YouTubeProvider } from "./YouTubeProvider";

/**
 * Wires the available sources. Spotify stays disabled when no credentials are
 * configured; any other http(s) URL falls back to the radio provider.
 */
export function createProviderRegistry(): AudioProvider {
  const youtube = new YouTubeProvider();

  const providers: AudioProvider[] = [
    youtube,
    new SoundCloudProvider(),
    new DeezerProvider(youtube),
    new AppleMusicProvider(youtube, env.appleMusicDeveloperToken, env.appleMusicStorefront),
  ];

  if (env.spotifyClientId && env.spotifyClientSecret) {
    providers.push(new SpotifyProvider(youtube, env.spotifyClientId, env.spotifyClientSecret, env.spotifyRefreshToken));
  }

  return new ProviderRegistry({
    providers,
    fallback: youtube,
    urlFallback: new RadioProvider(),
  });
}

export { ProviderRegistry } from "./ProviderRegistry";
export type { AudioProvider, AudioSource, PlaylistResult } from "./AudioProvider";
