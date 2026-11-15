import type { Readable } from "node:stream";
import type { AudioResource } from "@discordjs/voice";

/**
 * Preload until FFmpeg has actually produced audio data for the Opus encoder,
 * not merely until the yt-dlp child has spawned. The audio resource is left
 * unread: stream backpressure caps standby memory and CPU work.
 */
export function waitForAudioBuffer(
  resource: Pick<AudioResource, "playStream">,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<void> {
  const stream = resource.playStream as Readable;
  if (signal.aborted) return Promise.reject(new Error("Audio preload cancelled"));
  if (stream.readableLength > 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      stream.off("readable", onReadable);
      stream.off("error", onError);
      stream.off("end", onEnd);
      stream.off("close", onEnd);
      signal.removeEventListener("abort", onAbort);
    };
    const complete = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReadable = (): void => {
      if (stream.readableLength > 0) complete();
    };
    const onError = (error: Error): void => complete(error);
    const onEnd = (): void => complete(new Error("Audio stream closed before preloading"));
    const onAbort = (): void => complete(new Error("Audio preload cancelled"));
    const timer = setTimeout(
      () => complete(new Error("Audio preload timed out")),
      Math.max(1, timeoutMs),
    );

    stream.on("readable", onReadable);
    stream.once("error", onError);
    stream.once("end", onEnd);
    stream.once("close", onEnd);
    signal.addEventListener("abort", onAbort, { once: true });
    onReadable();
  });
}
