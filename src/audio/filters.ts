export type FilterPreset =
  | "off"
  | "bassboost"
  | "nightcore"
  | "vaporwave"
  | "8d"
  | "treble"
  | "loudnorm";

export const FILTER_PRESETS: readonly FilterPreset[] = [
  "off",
  "bassboost",
  "nightcore",
  "vaporwave",
  "8d",
  "treble",
  "loudnorm",
];

export const FILTER_LABELS: Record<FilterPreset, string> = {
  off: "Désactivé",
  bassboost: "Bass Boost",
  nightcore: "Nightcore",
  vaporwave: "Vaporwave",
  "8d": "8D",
  treble: "Treble",
  loudnorm: "Normalisation",
};

/**
 * FFmpeg filter chains per preset. Presets are mutually exclusive: a single
 * chain is built so effects cannot stack unpredictably.
 */
const FILTER_CHAINS: Record<Exclude<FilterPreset, "off">, string> = {
  bassboost: "bass=g=5",
  nightcore: "asetrate=48000*1.25,aresample=48000",
  vaporwave: "asetrate=48000*0.8,aresample=48000",
  "8d": "aformat=channel_layouts=stereo,apulsator=hz=0.09",
  treble: "treble=g=5",
  loudnorm: "loudnorm=I=-16:TP=-1.5:LRA=11",
};

/** Default short fade at boundaries; adjustable per guild. */
export const FADE_SECONDS = 2;
export const MAX_FADE_SECONDS = 5;

export interface AudioQualityOptions {
  /** Independent of the chosen sound-effect preset. */
  normalize?: boolean;
  /** Only remove leading silence; never truncate quiet mid-song sections. */
  trimStartSilence?: boolean;
  /** Zero disables fades; 1-5 seconds provides softer boundaries. */
  fadeSeconds?: number;
  /** In crossfade mode, keep the tail audible until the overlap begins. */
  skipFadeOut?: boolean;
}

export function sanitizeFadeSeconds(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_FADE_SECONDS, Math.round(value)))
    : FADE_SECONDS;
}

export function isFilterPreset(value: unknown): value is FilterPreset {
  return typeof value === "string" && (FILTER_PRESETS as readonly string[]).includes(value);
}

/**
 * Builds the `-af` chain for a preset, adding a fade-in at the start and a
 * fade-out near the end when the duration is known. Pure and testable.
 */
export function buildFilterChain(
  preset: FilterPreset,
  totalDurationSeconds?: number,
  startSeconds = 0,
  options: AudioQualityOptions = {},
): string | undefined {
  const parts: string[] = [];
  const fade = sanitizeFadeSeconds(options.fadeSeconds);
  const fromStart = startSeconds <= 0;

  // This is deliberately start-only. FFmpeg's "stop_periods=1" ends playback
  // on the first quiet passage, even if a song resumes after the silence.
  if (options.trimStartSilence && fromStart) {
    parts.push("silenceremove=start_periods=1:start_duration=0.25:start_threshold=-45dB:start_silence=0.05");
  }

  if (preset !== "off") parts.push(FILTER_CHAINS[preset]);

  // Reuse the existing loudnorm preset when explicitly selected, avoiding
  // two expensive normalization filters in the same FFmpeg graph.
  if (options.normalize && preset !== "loudnorm") {
    parts.push(FILTER_CHAINS.loudnorm);
  }

  // With an output seek the first `startSeconds` are discarded, so a fade-in
  // anchored at zero would be lost; never restart a fade on seeking.
  if (fromStart && fade > 0) {
    parts.push(`afade=t=in:st=0:d=${fade}`);
  }

  // Do not add an end fade when duration is unknown, e.g. a live radio.
  if (!options.skipFadeOut && fade > 0 && totalDurationSeconds !== undefined && Number.isFinite(totalDurationSeconds)) {
    const remaining = totalDurationSeconds - Math.max(0, startSeconds);
    if (remaining > fade * 2) {
      const fadeOutStart = Number((totalDurationSeconds - fade).toFixed(3));
      if (fadeOutStart > 0) {
        parts.push(`afade=t=out:st=${fadeOutStart}:d=${fade}`);
      }
    }
  }

  return parts.length > 0 ? parts.join(",") : undefined;
}
