export type StallAction = "none" | "recover" | "skip";

export interface StallEvaluation {
  /** Last sampled resource playback duration (ms). */
  previousDuration: number;
  /** Current sampled resource playback duration (ms). */
  currentDuration: number;
  /** Consecutive checks already observed with no progress. */
  stalledChecks: number;
  checkIntervalMs: number;
  stallTimeoutMs: number;
  recoveries: number;
  maxRecoveries: number;
}

/**
 * Decides how to react to a possibly frozen stream. Playback is considered
 * stalled only when the resource's playback duration stops advancing for at
 * least `stallTimeoutMs`; any movement (forward progress or a reset after a
 * seek/reload) clears the stall. Recovers a bounded number of times, then
 * skips. Pure and exported for testing.
 */
export function evaluateStall(params: StallEvaluation): {
  stalledChecks: number;
  action: StallAction;
} {
  if (params.checkIntervalMs <= 0 || params.stallTimeoutMs <= 0) {
    return { stalledChecks: 0, action: "none" };
  }

  if (params.currentDuration !== params.previousDuration) {
    return { stalledChecks: 0, action: "none" };
  }

  const stalledChecks = params.stalledChecks + 1;
  if (stalledChecks * params.checkIntervalMs < params.stallTimeoutMs) {
    return { stalledChecks, action: "none" };
  }

  return {
    stalledChecks: 0,
    action: params.recoveries < params.maxRecoveries ? "recover" : "skip",
  };
}
