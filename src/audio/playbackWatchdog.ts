import type { AudioPlayer, AudioPlayerStatus } from "@discordjs/voice";

/**
 * Resolves once the player reaches `status`, rejects if it emits an `error`
 * first, or rejects after `timeoutMs`. Used to detect a stalled yt-dlp/FFmpeg
 * pipe that would otherwise leave the player stuck in BUFFERING forever.
 * Pure over the injected player, so it is unit-testable with a real AudioPlayer.
 */
export function waitForStatus(
  player: AudioPlayer,
  status: AudioPlayerStatus,
  timeoutMs: number,
  errorEvent = "error",
): Promise<void> {
  if (timeoutMs <= 0 || player.state.status === status) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      player.off(status, onStatus);
      player.off(errorEvent, onError);
    };
    const onStatus = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out after ${timeoutMs} ms waiting for ${status}`));
    }, timeoutMs);

    player.once(status, onStatus);
    player.once(errorEvent, onError);
  });
}
