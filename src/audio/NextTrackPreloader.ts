/**
 * Holds at most one standby audio pipeline for a guild.
 *
 * A replaced/cancelled preparation is always cleaned up, including when the
 * asynchronous source resolution completes after cancellation. The in-flight
 * promise never escapes as an unhandled rejection.
 */
export class NextTrackPreloader<T> {
  private job?: {
    key: string;
    startedAt: number;
    cancelled: boolean;
    abort: AbortController;
    promise: Promise<T | undefined>;
  };

  constructor(
    private readonly prepare: (key: string) => Promise<T>,
    private readonly waitUntilReady: (value: T, signal: AbortSignal) => Promise<void>,
    private readonly dispose: (value: T) => Promise<void>,
    private readonly maxAgeMs = 45_000,
    private readonly onFailure?: (error: unknown) => void,
  ) {}

  get key(): string | undefined {
    return this.job?.key;
  }

  warm(key: string): void {
    if (this.job?.key === key && Date.now() - this.job.startedAt < this.maxAgeMs) return;
    this.cancel();

    const job = {
      key,
      startedAt: Date.now(),
      cancelled: false,
      abort: new AbortController(),
      promise: Promise.resolve(undefined) as Promise<T | undefined>,
    };
    this.job = job;

    job.promise = (async () => {
      let value: T | undefined;
      try {
        value = await this.prepare(key);
        if (job.cancelled) {
          await this.dispose(value);
          return undefined;
        }

        await this.waitUntilReady(value, job.abort.signal);
        if (job.cancelled) {
          await this.dispose(value);
          return undefined;
        }
        return value;
      } catch (error) {
        if (value !== undefined) {
          try { await this.dispose(value); } catch (disposeError) { this.onFailure?.(disposeError); }
        }
        if (!job.cancelled) this.onFailure?.(error);
        return undefined;
      }
    })();

    void job.promise.then((result) => {
      if (result === undefined && this.job === job) this.job = undefined;
    });
  }

  /** Take ownership of the prepared pipeline; a not-yet-ready job is not reused. */
  async take(key: string, maxWaitMs = 0): Promise<T | undefined> {
    const job = this.job;
    if (!job || job.key !== key) {
      this.cancel();
      return undefined;
    }
    if (Date.now() - job.startedAt >= this.maxAgeMs) {
      this.cancel();
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), Math.max(0, maxWaitMs));
    });
    try {
      const result = await Promise.race([job.promise, timeout]);
      if (this.job !== job || result === undefined) {
        if (this.job === job) this.cancel();
        return undefined;
      }
      this.job = undefined;
      job.cancelled = true;
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  cancel(): void {
    const job = this.job;
    if (!job) return;
    this.job = undefined;
    job.cancelled = true;
    job.abort.abort();

    // If preparation already finished, it still owns a process that needs
    // terminating. An in-progress job disposes its own result when it arrives.
    void job.promise.then(async (result) => {
      if (result !== undefined) await this.dispose(result);
    }).catch((error) => this.onFailure?.(error));
  }
}
