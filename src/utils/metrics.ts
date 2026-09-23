export interface MetricsSnapshot {
  tracksStarted: number;
  tracksFailed: number;
}

let tracksStarted = 0;
let tracksFailed = 0;

export function recordTrackStarted(): void {
  tracksStarted += 1;
}

export function recordTrackFailed(): void {
  tracksFailed += 1;
}

export function metricsSnapshot(): MetricsSnapshot {
  return { tracksStarted, tracksFailed };
}
