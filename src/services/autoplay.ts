import type { Track } from "../music/Track";

/**
 * Picks the first candidate that is neither the seed nor already played.
 * Pure and exported for testing.
 */
export function pickRelatedTrack(
  candidates: readonly Track[],
  seedId: string,
  exclude: ReadonlySet<string>,
): Track | undefined {
  return candidates.find((track) => track.id !== seedId && !exclude.has(track.id));
}

/**
 * Spotify-radio style pick: a random candidate that is neither the seed nor
 * already played, so consecutive auto-played tracks vary while staying in the
 * same "mood". Pure and exported for testing.
 */
/**
 * Prefer recognizable original tracks of a similar mood over karaoke/live
 * clones, while preserving some randomness. All inputs have stable metadata;
 * no external API requests are added to autoplay.
 */
export function pickSmartRelatedTrack(
  candidates: readonly Track[],
  seed: Track,
  exclude: ReadonlySet<string>,
  random: () => number = Math.random,
): Track | undefined {
  const pool = candidates
    .filter((track) => track.id !== seed.id && !exclude.has(track.id))
    .map((track) => {
      let score = 10;
      if (track.author && seed.author &&
          track.author.toLowerCase() === seed.author.toLowerCase()) score += 5;
      if (track.duration && seed.duration) {
        const diff = Math.abs(track.duration - seed.duration);
        if (diff <= 45) score += 3;
        if (diff > 300) score -= 4;
      }
      const title = track.title.toLowerCase();
      const original = seed.title.toLowerCase();
      for (const unwanted of ["karaoke", "nightcore", "sped up", "slowed", "8d audio", "reaction", "cover"]) {
        if (title.includes(unwanted) && !original.includes(unwanted)) score -= 8;
      }
      return { track, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!pool.length) return undefined;
  const weights = pool.map((entry) => Math.max(1, entry.score));
  const total = weights.reduce((a, b) => a + b, 0);
  let position = Math.min(0.999999, Math.max(0, random())) * total;
  for (let i = 0; i < pool.length; i++) {
    position -= weights[i];
    if (position < 0) return pool[i].track;
  }
  return pool[pool.length - 1].track;
}

export function pickRandomRelatedTrack(
  candidates: readonly Track[],
  seedId: string,
  exclude: ReadonlySet<string>,
): Track | undefined {
  const pool = candidates.filter((track) => track.id !== seedId && !exclude.has(track.id));
  if (pool.length === 0) return undefined;
  return pool[Math.floor(Math.random() * pool.length)];
}
