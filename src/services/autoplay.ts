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
export function pickRandomRelatedTrack(
  candidates: readonly Track[],
  seedId: string,
  exclude: ReadonlySet<string>,
): Track | undefined {
  const pool = candidates.filter((track) => track.id !== seedId && !exclude.has(track.id));
  if (pool.length === 0) return undefined;
  return pool[Math.floor(Math.random() * pool.length)];
}
