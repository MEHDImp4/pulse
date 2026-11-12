import type { RequestedBy, Track } from "../music/Track";
import type { AudioProvider, AudioSource, PlaylistResult } from "./AudioProvider";

export interface ProviderRegistryOptions {
  /** URL-specific providers, checked in order. */
  providers: AudioProvider[];
  /** Used for text search and as the last resort. */
  fallback: AudioProvider;
  /** Handles any remaining http(s) URL (e.g. radio). */
  urlFallback?: AudioProvider;
}

/**
 * Dispatches each operation to the right source while presenting a single
 * `AudioProvider` facade, so the rest of the pipeline is source-agnostic.
 */
export class ProviderRegistry implements AudioProvider {
  private readonly providers: AudioProvider[];
  private readonly fallback: AudioProvider;
  private readonly urlFallback?: AudioProvider;

  constructor(options: ProviderRegistryOptions) {
    this.providers = options.providers;
    this.fallback = options.fallback;
    this.urlFallback = options.urlFallback;
  }

  get name() {
    return this.fallback.name;
  }

  supports(url: string): boolean {
    return this.find(url) !== undefined;
  }

  async search(query: string, requestedBy: RequestedBy): Promise<Track> {
    return this.fallback.search(query, requestedBy);
  }

  async searchChoices(query: string, requestedBy: RequestedBy, limit: number): Promise<Track[]> {
    return this.fallback.searchChoices
      ? this.fallback.searchChoices(query, requestedBy, limit)
      : [await this.fallback.search(query, requestedBy)];
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    const provider = this.find(url) ?? this.fallback;
    return provider.resolve(url, requestedBy);
  }

  async createSource(track: Track): Promise<AudioSource> {
    return this.providerForTrack(track).createSource(track);
  }

  async resolvePlaylist(
    url: string,
    requestedBy: RequestedBy,
    limit?: number,
  ): Promise<PlaylistResult> {
    const provider = this.find(url) ?? this.fallback;
    if (!provider.resolvePlaylist) {
      throw new Error("Les playlists ne sont pas supportées pour ce lien.");
    }
    return provider.resolvePlaylist(url, requestedBy, limit);
  }

  async related(seed: Track, exclude: ReadonlySet<string>): Promise<Track | undefined> {
    return this.fallback.related ? this.fallback.related(seed, exclude) : undefined;
  }

  find(url: string): AudioProvider | undefined {
    const match = this.providers.find((provider) => provider.supports(url));
    if (match) return match;
    if (this.urlFallback?.supports(url)) return this.urlFallback;
    return undefined;
  }

  providerForTrack(track: Track): AudioProvider {
    return (
      this.providers.find((provider) => provider.name === track.provider) ??
      (track.provider === "radio" ? this.urlFallback : undefined) ??
      this.fallback
    );
  }
}
