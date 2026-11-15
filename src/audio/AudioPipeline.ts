import { spawn, type ChildProcess } from "node:child_process";
import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice";
import { env } from "../config/env";
import type { QueueAudioCache } from "./QueueAudioCache";
import type { Track } from "../music/Track";
import type { AudioProvider } from "../providers/AudioProvider";
import { logger } from "../utils/logger";
import { buildFilterChain, type FilterPreset, type AudioQualityOptions } from "./filters";
import { buildCrossfadeGraph, type CrossfadePlan } from "./crossfade";
import { percentToGain } from "./volume";

const URL_PATTERN = /https?:\/\/\S+/gi;

/** Stream URLs can carry tokens; never log them verbatim. */
function redactUrls(text: string): string {
  return text.replace(URL_PATTERN, "[url]");
}

export interface AudioPipelineResult {
  processes: ChildProcess[];
  resource: AudioResource<Track>;
  cleanup?: () => void;
  fromCache?: boolean;
}

export interface AudioPipelineOptions extends AudioQualityOptions {
  filter?: FilterPreset;
  startSeconds?: number;
  useCache?: boolean;
}

export class AudioPipeline {
  constructor(private readonly provider: AudioProvider, private readonly cache?: QueueAudioCache) {}

  /**
   * Prepare a real two-input mix of A's last seconds and B's beginning.
   * Requires complete local audio for BOTH tracks; returns undefined when
   * unavailable so GuildPlayer can use its existing safe transition path.
   */
  async createCrossfade(
    current: Track,
    next: Track,
    plan: CrossfadePlan,
    volume: number,
    options: AudioQualityOptions = {},
  ): Promise<AudioPipelineResult | undefined> {
    if (!this.cache || current.isLive || next.isLive || !next.duration) return undefined;
    const [currentPath, nextPath] = await Promise.all([
      this.cache.pathFor(current),
      this.cache.pathFor(next),
    ]);
    if (!currentPath || !nextPath) return undefined;

    const ffmpeg = spawn(env.ffmpegPath, [
      "-hide_banner", "-loglevel", "warning", "-nostdin",
      "-ss", String(plan.startAtSeconds), "-i", currentPath,
      "-i", nextPath,
      "-filter_complex", buildCrossfadeGraph(
        plan, next.duration, options.normalize, options.fadeSeconds,
      ),
      "-map", "[out]",
      "-vn", "-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      logger.debug({ track: next.title, ffmpeg: redactUrls(chunk.toString("utf8").slice(-1_000)) }, "Crossfade FFmpeg stderr");
    });
    ffmpeg.on("error", (error) => {
      logger.warn({ err: error, guildTrack: next.id }, "Crossfade FFmpeg failed");
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      metadata: next,
      inlineVolume: true,
    });
    resource.volume?.setVolume(percentToGain(volume, env.volumeHeadroomDb, env.volumeRangeDb));
    return { processes: [ffmpeg], resource, fromCache: true };
  }

  async create(
    track: Track,
    volume = 100,
    options: AudioPipelineOptions = {},
  ): Promise<AudioPipelineResult> {
    const cachedPath = options.useCache === false ? undefined : await this.cache?.pathFor(track);
    const source = cachedPath ? undefined : await this.provider.createSource(track);

    const isLive = track.isLive === true;
    const startSeconds = isLive ? 0 : Math.max(0, options.startSeconds ?? 0);
    const filterChain = buildFilterChain(
      options.filter ?? "off",
      isLive ? undefined : track.duration,
      startSeconds,
      {
        normalize: options.normalize,
        trimStartSilence: !isLive && options.trimStartSilence,
        fadeSeconds: options.fadeSeconds,
      },
    );

    const args = ["-hide_banner", "-loglevel", "warning", "-nostdin"];
    if (cachedPath) {
      args.push("-i", cachedPath);
    } else if (source?.kind === "url") {
      args.push(
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-rw_timeout", "15000000",
        "-i", source.url,
      );
    } else {
      args.push("-i", "pipe:0");
    }
    if (startSeconds > 0) args.push("-ss", String(Math.floor(startSeconds)));
    args.push("-vn");
    if (filterChain) args.push("-af", filterChain);
    args.push("-f", "s16le", "-ar", "48000", "-ac", "2", "pipe:1");

    const ffmpeg = spawn(
      env.ffmpegPath,
      args,
      {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      },
    );

    const processes: ChildProcess[] = [];

    if (source?.kind === "pipe" || source?.kind === "stream") {
      source.stream.pipe(ffmpeg.stdin);
      source.stream.on("error", (error) => {
        logger.error({ err: error, track: track.title }, "Source stream error");
        ffmpeg.stdin.destroy(error);
      });
      if (source.kind === "pipe") processes.push(source.process);
      else ffmpeg.once("close", source.close);
    }

    ffmpeg.stdin.on("error", (error) => {
      logger.debug({ err: error, track: track.title }, "FFmpeg stdin closed");
    });

    let ffmpegStderr = "";

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      ffmpegStderr = (ffmpegStderr + text).slice(-8000);
      logger.debug({ track: track.title, ffmpeg: redactUrls(text.trim()) }, "FFmpeg stderr");
    });

    ffmpeg.on("error", (error) => {
      logger.error({ err: error, track: track.title }, "FFmpeg process error");
    });

    ffmpeg.on("close", (code, signal) => {
      if (code !== 0 && signal !== "SIGKILL") {
        logger.error(
          {
            track: track.title,
            code,
            signal,
            stderr: redactUrls(ffmpegStderr.trim()),
          },
          "FFmpeg exited with an error",
        );
      } else {
        logger.info({ track: track.title, code, signal }, "FFmpeg exited");
      }
    });

    processes.push(ffmpeg);

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      metadata: track,
      inlineVolume: true,
    });
    if (resource.volume) {
      resource.volume.setVolume(percentToGain(volume, env.volumeHeadroomDb, env.volumeRangeDb));
    }

    return {
      processes,
      resource,
      cleanup: source?.kind === "stream" ? source.close : undefined,
      fromCache: cachedPath !== undefined,
    };
  }
}
