/** Bounded, per-session audio diagnostics without track titles or user identifiers. */
export interface PlaybackDiagnosticsSnapshot {
  transitions: number;
  avgTransitionMs: number;
  p95TransitionMs: number;
  maxTransitionMs: number;
  lastTransitionMs?: number;
  slowTransitions: number;
  preloadHits: number;
  cacheHits: number;
  cacheMisses: number;
  stallRecoveries: number;
  stallSkips: number;
  startFailures: number;
  playerErrors: number;
}

/**
 * Keeps a rolling window so long-lived bots don't grow their heap or
 * let last month's glitches permanently dominate the recent p95.
 */
export class PlaybackDiagnostics {
  private readonly gaps: number[] = [];
  private preloadHits = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private stallRecoveries = 0;
  private stallSkips = 0;
  private startFailures = 0;
  private playerErrors = 0;
  private transitions = 0;
  private slowTransitions = 0;
  private lastTransitionMs?: number;

  constructor(
    private readonly windowSize = 50,
    private readonly slowThresholdMs = 1_000,
  ) {}

  transition(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const duration = Math.round(ms);
    this.transitions++;
    this.lastTransitionMs = duration;
    if (duration > this.slowThresholdMs) this.slowTransitions++;
    this.gaps.push(duration);
    if (this.gaps.length > Math.max(1, this.windowSize)) this.gaps.shift();
  }

  preloadUsed(): void { this.preloadHits++; }
  cacheUsed(): void { this.cacheHits++; }
  streamed(): void { this.cacheMisses++; }
  stallRecovered(): void { this.stallRecoveries++; }
  stallSkipped(): void { this.stallSkips++; }
  startFailed(): void { this.startFailures++; }
  playerErrored(): void { this.playerErrors++; }

  snapshot(): PlaybackDiagnosticsSnapshot {
    const ordered = [...this.gaps].sort((a, b) => a - b);
    const sum = ordered.reduce((total, ms) => total + ms, 0);
    return {
      transitions: this.transitions,
      avgTransitionMs: ordered.length ? Math.round(sum / ordered.length) : 0,
      p95TransitionMs: ordered.length ? ordered[Math.ceil(ordered.length * 0.95) - 1] : 0,
      maxTransitionMs: ordered.at(-1) ?? 0,
      lastTransitionMs: this.lastTransitionMs,
      slowTransitions: this.slowTransitions,
      preloadHits: this.preloadHits,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      stallRecoveries: this.stallRecoveries,
      stallSkips: this.stallSkips,
      startFailures: this.startFailures,
      playerErrors: this.playerErrors,
    };
  }
}
