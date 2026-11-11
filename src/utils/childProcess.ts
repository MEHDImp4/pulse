import type { ChildProcess } from "node:child_process";

export interface TerminateOptions {
  /** Grace period before escalating to SIGKILL (ms). */
  graceMs?: number;
  /** Called for every process that had to be force-killed. */
  onForceKill?: (process: ChildProcess) => void;
  /** Maximum wait after SIGKILL before reporting an unresponsive child (ms). */
  forceWaitMs?: number;
}

export function hasExited(process: ChildProcess): boolean {
  return process.exitCode !== null || process.signalCode !== null;
}

/**
 * Terminates every process gracefully first, then forcefully. Resolves once all
 * processes have really exited (not merely when `kill()` was called), which
 * avoids leaving yt-dlp/FFmpeg children running after a skip or shutdown.
 */
export async function terminateAll(
  processes: readonly ChildProcess[],
  options: TerminateOptions = {},
): Promise<void> {
  if (processes.length === 0) return;
  const graceMs = options.graceMs ?? 1_000;

  const exits = processes.map(
    (process) =>
      new Promise<void>((resolve) => {
        if (hasExited(process)) {
          resolve();
          return;
        }
        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          resolve();
        };
        process.once("exit", done);
        process.once("close", done);
        process.once("error", done);
      }),
  );

  // Phase 1: ask every live process to terminate.
  for (const process of processes) {
    if (!hasExited(process)) process.kill("SIGTERM");
  }

  // Phase 2: wait for a graceful exit, then escalate.
  const exitedInTime = await Promise.race([
    Promise.all(exits).then(() => true),
    new Promise<false>((resolve) => {
      setTimeout(() => resolve(false), graceMs).unref();
    }),
  ]);

  if (!exitedInTime) {
    for (const process of processes) {
      if (!hasExited(process)) {
        process.kill("SIGKILL");
        options.onForceKill?.(process);
      }
    }

    // SIGKILL only requests termination. Wait for the actual exit event
    // before reporting that FFmpeg / yt-dlp children are cleaned up.
    const allExited = await Promise.race([
      Promise.all(exits).then(() => true),
      new Promise<false>((resolve) => {
        setTimeout(() => resolve(false), options.forceWaitMs ?? 1_000).unref();
      }),
    ]);
    if (!allExited) throw new Error("A child process did not exit after SIGKILL");
  }
}
