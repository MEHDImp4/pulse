import { spawn, type ChildProcess } from "node:child_process";
import { createAudioResource, StreamType, type AudioResource } from "@discordjs/voice";
import { env } from "../config/env";
import type { Track } from "../music/Track";
import type { AudioProvider } from "../providers/AudioProvider";
import { logger } from "../utils/logger";
import { buildFilterChain, type FilterPreset } from "./filters";
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
}

export interface AudioPipelineOptions {
  filter?: FilterPreset;
  startSeconds?: number;
}

export class AudioPipeline {
  constructor(private readonly provider: AudioProvider) {}

  async create(
    track: Track,
    volume = 100,
    options: AudioPipelineOptions = {},
  ): Promise<AudioPipelineResult> {
    const source = await this.provider.createSource(track);

    const isLive = track.isLive === true;
    const startSeconds = isLive ? 0 : Math.max(0, options.startSeconds ?? 0);
    const filterChain = buildFilterChain(
      options.filter ?? "off",
      isLive ? undefined : track.duration,
      startSeconds,
    );

    const args = ["-hide_banner", "-loglevel", "warning", "-nostdin"];
    if (source.kind === "url") {
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

    if (source.kind === "pipe" || source.kind === "stream") {
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
      cleanup: source.kind === "stream" ? source.close : undefined,
    };
  }
}
