import type { Track, TrackProvider } from "../music/Track";
import { pickRandomRelatedTrack } from "../services/autoplay";
import { logger } from "../utils/logger";
import { isYouTubeUrl, mixUrl, watchUrl } from "./youtube";
import { YtDlpProvider, type YtDlpInfo } from "./YtDlpProvider";

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

    // Run the two primary lookups concurrently to cut auto-advance latency:
    // 1) the auto-generated mix (closest thing to a radio station),
    // 2) a title+author search. Preference order is preserved below.
    const searchQuery = seed.author ? `${seed.author} ${seed.title}` : seed.title;
    const [mixResult, searchResult] = await Promise.allSettled([
      this.fetchEntries(mixUrl(seed.id), 30),
      this.fetchEntries(`ytsearch10:${searchQuery}`, 10),
    ]);

    const pools: YtDlpInfo[][] = [];
    if (mixResult.status === "fulfilled") pools.push(mixResult.value.entries);
    else logger.debug({ err: mixResult.reason, track: seed.title }, "YouTube mix lookup failed");

    if (searchResult.status === "fulfilled") pools.push(searchResult.value.entries);
    else logger.debug({ err: searchResult.reason, query: searchQuery }, "Related search failed");

    for (const entries of pools) {
      const picked = pickRandomRelatedTrack(this.toTracks(entries, seed.requestedBy), seed.id, exclude);
      if (picked) return picked;
    }

    // 3) Progressively broader fallback: author only (title-only already ran).
    const fallbacks = seed.author ? [seed.author] : [];
    for (const query of fallbacks) {
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
