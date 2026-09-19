import { formatDuration } from "../utils/time";

const BAR_LENGTH = 16;
const FILLED = "━";
const EMPTY = "─";
const KNOB = "●";

/**
 * Single-line progress, meant to be wrapped in a code block by the caller so
 * the monospace glyphs stay aligned. Falls back to elapsed-only when the total
 * duration is unknown (live streams).
 */
export function renderProgressBar(elapsedMs: number, totalSeconds?: number, length = BAR_LENGTH): string {
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  if (totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return `▶ ${formatDuration(elapsedSeconds)}`;
  }

  const ratio = Math.max(0, Math.min(1, elapsedMs / (totalSeconds * 1000)));
  const filled = Math.max(0, Math.min(length, Math.round(ratio * length)));
  const bar = `${FILLED.repeat(filled)}${KNOB}${EMPTY.repeat(Math.max(0, length - filled))}`;

  return `${bar}  ${formatDuration(elapsedSeconds)} / ${formatDuration(totalSeconds)}`;
}
