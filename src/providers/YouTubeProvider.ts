import type { Track, TrackProvider } from "../music/Track";
import { pickRandomRelatedTrack } from "../services/autoplay";
import { logger } from "../utils/logger";
import { isYouTubeUrl, mixUrl, watchUrl } from "./youtube";
import { YtDlpProvider } from "./YtDlpProvider";

export class YouTubeProvider extends YtDlpProvider {
  readonly name = "youtube" as TrackProvider;
  protected readonly searchPrefix = "ytsearch";

  protected isAllowedUrl(url: string): boolean {
    return isYouTubeUrl(url);
  }

  protected urlFromId(id: string): string | undefined {
    return watchUrl(id);
  }

  async related(seed: Track, exclude: ReadonlySet<string>): Promise<Track | undefined> {
    if (!seed.id) return undefined;

    // 1) YouTube auto-generated mix: the closest thing to a radio station.
    try {
      const mix = await this.fetchEntries(mixUrl(seed.id), 30);
      const fromMix = pickRandomRelatedTrack(this.toTracks(mix.entries, seed.requestedBy), seed.id, exclude);
      if (fromMix) return fromMix;
    } catch (error) {
      logger.debug({ err: error, track: seed.title }, "YouTube mix lookup failed, falling back to search");
    }

    // 2) Title+author search, then 3) author only, progressively broader.
    const queries = seed.author
      ? [`${seed.author} ${seed.title}`, seed.author]
      : [seed.title];

    for (const query of queries) {
      try {
        const candidates = this.toTracks(
          (await this.fetchEntries(`ytsearch10:${query}`, 10)).entries,
          seed.requestedBy,
        );
        const picked = pickRandomRelatedTrack(candidates, seed.id, exclude);
        if (picked) return picked;
      } catch (error) {
        logger.debug({ err: error, query }, "Related search failed");
      }
    }

    return undefined;
  }
}
