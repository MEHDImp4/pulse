import type { Track } from "../music/Track";
import { buildFilterChain, type FilterPreset } from "./filters";

export interface CrossfadePlan {
  overlapSeconds: number;
  startAtSeconds: number;
}

/**
 * A real overlapping crossfade needs both compressed audio files on disk.
 * Never attempt it on live sources, unknown timings, tempo-changing presets
 * or silence-trim mode (which invalidates timeline-based scheduling).
 */
export function planCrossfade(
  current: Track | undefined,
  next: Track | undefined,
  overlapSeconds: number,
  filter: FilterPreset,
  trimStartSilence: boolean,
): CrossfadePlan | undefined {
  if (!current || !next || current.isLive || next.isLive ||
      filter !== "off" || trimStartSilence ||
      !current.duration || !next.duration ||
      !Number.isFinite(current.duration) || !Number.isFinite(next.duration) ||
      !Number.isInteger(overlapSeconds) || overlapSeconds < 1 || overlapSeconds > 5 ||
      current.duration <= overlapSeconds * 3 ||
      next.duration <= overlapSeconds * 3) {
    return undefined;
  }
  return {
    overlapSeconds,
    startAtSeconds: current.duration - overlapSeconds,
  };
}

/**
 * Tail of A overlaps the head of B, and FFmpeg continues streaming the
 * remainder of B. Output length is B's full duration, so playback's clock
 * resets to the new song at the beginning of the overlap.
 */
export function buildCrossfadeGraph(
  plan: CrossfadePlan,
  nextDurationSeconds: number,
  normalize = false,
  fadeSeconds = 2,
): string {
  const d = plan.overlapSeconds;
  const post = buildFilterChain("off", nextDurationSeconds, 1, { normalize, fadeSeconds });
  const ending = post ? `,${post}` : "";
  return [
    `[0:a]atrim=duration=${d},asetpts=PTS-STARTPTS[a]`,
    "[1:a]asetpts=PTS-STARTPTS[b]",
    `[a][b]acrossfade=d=${d}:c1=tri:c2=tri${ending}[out]`,
  ].join(";");
}
