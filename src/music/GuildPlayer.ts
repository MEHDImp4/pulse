import { spawn, type ChildProcess } from "node:child_process";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioResource,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Message, VoiceBasedChannel } from "discord.js";
import { AudioPipeline } from "../audio/AudioPipeline";
import type { FilterPreset } from "../audio/filters";
import { waitForStatus } from "../audio/playbackWatchdog";
import { percentToGain } from "../audio/volume";
import { env } from "../config/env";
import type { AudioProvider } from "../providers/AudioProvider";
import { terminateAll } from "../utils/childProcess";
import { logger } from "../utils/logger";
import { recordTrackFailed, recordTrackStarted } from "../utils/metrics";
import { DEFAULT_GUILD_SETTINGS, type GuildSettings } from "./GuildSettingsStore";
import type { PlayerState } from "./PlayerState";
import { QueueManager } from "./QueueManager";
import { toSessionId } from "./session";
import type { Track } from "./Track";

export interface AddTrackResult {
  started: boolean;
  position: number;
}

export type LoopMode = "off" | "track" | "queue";

export type NotifyFn = (channelId: string, content: string) => void;

/**
 * Pure decision for the next track to play. Mutates the queue to implement
 * loop-queue semantics. Exported for testability.
 */
export function decideNext(
  finished: Track | undefined,
  loopMode: LoopMode,
  queue: QueueManager,
): Track | undefined {
  if (finished && loopMode === "track") return finished;

  const next = queue.dequeue();

  if (finished && loopMode === "queue") {
    try {
      queue.enqueue(finished);
    } catch {
      // Queue is full: drop the re-queue rather than crash playback.
    }
  }

  return next ?? (finished && loopMode === "queue" ? finished : undefined);
}

export class GuildPlayer {
  readonly queue = new QueueManager(env.maxQueueSize);
  readonly audioPlayer = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  private readonly pipeline: AudioPipeline;
  private connection?: VoiceConnection;
  private childProcesses: ChildProcess[] = [];
  private currentResource?: AudioResource;
  private idleTimer?: NodeJS.Timeout;
  private emptyChannelTimer?: NodeJS.Timeout;
  private autoplayRetryTimer?: NodeJS.Timeout;
  private serial: Promise<unknown> = Promise.resolve();
  private destroyed = false;
  private bypassLoop = false;
  private _currentTrack?: Track;
  private _state: PlayerState = "IDLE";
  private _channelId: string;
  private _lastTextChannelId?: string;
  private _volume = 100;
  private _loopMode: LoopMode = "off";
  private _autoplay = false;
  private _filter: FilterPreset = "off";
  private _seekOffsetMs = 0;
  private suppressNextIdle = false;
  private startingTrack = false;
  private autoplayCount = 0;
  private readonly recentTrackIds = new Set<string>();
  private readonly history: Track[] = [];
  private readonly skipVotes = new Set<string>();
  private _nowPlayingMessage?: Message;
  private _nowPlayingIdle = false;

  constructor(
    readonly guildId: string,
    channelId: string,
    provider: AudioProvider,
    private readonly onDestroyed: (sessionId: string) => void,
    private readonly onNotify?: NotifyFn,
    initialSettings: GuildSettings = DEFAULT_GUILD_SETTINGS,
    private readonly onSettingsChange?: (patch: Partial<GuildSettings>) => void,
    private readonly onQueueChange?: (player: GuildPlayer) => void,
    private readonly onAutoplay?: (seed: Track, exclude: ReadonlySet<string>) => Promise<Track | undefined>,
  ) {
    this._channelId = channelId;
    this.pipeline = new AudioPipeline(provider);
    this._volume = initialSettings.volume;
    this._loopMode = initialSettings.loopMode;
    this._autoplay = initialSettings.autoplay;
    this._filter = initialSettings.filter;

    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      this._state = "PLAYING";
      logger.info(
        {
          guild: this.guildId,
          track: this._currentTrack?.title ?? "diagnostic-tone",
          playableConnections: this.audioPlayer.playable.length,
        },
        "Audio player entered PLAYING",
      );
    });

    this.audioPlayer.on(AudioPlayerStatus.Paused, () => {
      this._state = "PAUSED";
    });

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      void this.runExclusive(async () => {
        if (this.destroyed) return;
        if (this.suppressNextIdle) {
          this.suppressNextIdle = false;
          return;
        }
        logger.info({ guild: this.guildId }, "Audio player entered IDLE");
        const finished = this._currentTrack;
        await this.killProcesses();
        this.currentResource = undefined;
        this._currentTrack = undefined;
        this.skipVotes.clear();
        if (finished) this.pushHistory(finished);
        const loopBack = this.bypassLoop ? undefined : finished;
        this.bypassLoop = false;
        await this.playNextInternal(loopBack);
      });
    });

    this.audioPlayer.on("error", (error) => {
      logger.error(
        { err: error, guild: this.guildId },
        "Audio player error",
      );
      this._state = "ERROR";
      // While startTrack is retrying, its watchdog observes this error and will
      // retry; swallow the Idle emitted by stop() so the queue is not advanced
      // behind the retry. Only when truly idle, so the flag cannot linger.
      if (this.startingTrack && this.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
        this.suppressNextIdle = true;
      }
      this.audioPlayer.stop(true);
    });

    this.audioPlayer.on("debug", (message) => {
      logger.debug({ guild: this.guildId, message }, "Audio player debug");
    });
  }

  get currentTrack(): Track | undefined {
    return this._currentTrack;
  }

  get state(): PlayerState {
    return this._state;
  }

  get channelId(): string {
    return this._channelId;
  }

  /**
   * Rebinds this session to another voice channel after Discord moves the bot.
   * The live VoiceConnection follows the move on its own, so only the session
   * key needs updating; the owner migrates the map/settings/queue keys.
   */
  bindChannel(channelId: string): void {
    this._channelId = channelId;
  }

  get sessionId(): string {
    return toSessionId(this.guildId, this.channelId);
  }

  get queueSize(): number {
    return this.queue.size;
  }

  get isConnected(): boolean {
    return Boolean(this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed);
  }

  /** Voice websocket/udp latency, or undefined when not connected. */
  get voicePing(): { ws?: number; udp?: number } | undefined {
    if (!this.connection) return undefined;
    return { ws: this.connection.ping.ws, udp: this.connection.ping.udp };
  }

  /** Number of live child processes (yt-dlp + FFmpeg) for this session. */
  get childProcessCount(): number {
    return this.childProcesses.length;
  }

  get lastTextChannelId(): string | undefined {
    return this._lastTextChannelId;
  }

  set lastTextChannelId(id: string | undefined) {
    this._lastTextChannelId = id;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(100, Math.round(value)));
    if (this.currentResource?.volume) {
      this.currentResource.volume.setVolume(percentToGain(this._volume, env.volumeHeadroomDb, env.volumeRangeDb));
    }
    this.onSettingsChange?.({ volume: this._volume });
  }

  get loopMode(): LoopMode {
    return this._loopMode;
  }

  set loopMode(mode: LoopMode) {
    this._loopMode = mode;
    this.onSettingsChange?.({ loopMode: mode });
  }

  get autoplay(): boolean {
    return this._autoplay;
  }

  set autoplay(value: boolean) {
    this._autoplay = value;
    this.onSettingsChange?.({ autoplay: value });
  }

  get filter(): FilterPreset {
    return this._filter;
  }

  set filter(preset: FilterPreset) {
    this._filter = preset;
    this.onSettingsChange?.({ filter: preset });
  }

  /** Notifies the owner that the queue content changed (for persistence). */
  notifyQueueChange(): void {
    try {
      this.onQueueChange?.(this);
    } catch (error) {
      logger.warn({ err: error, guild: this.guildId }, "Queue change notification failed");
    }
  }

  get skipVoteCount(): number {
    return this.skipVotes.size;
  }

  get playbackElapsedMs(): number | undefined {
    if (!this.currentResource) return undefined;
    return (this.currentResource.playbackDuration ?? 0) + this._seekOffsetMs;
  }

  get nowPlayingMessage(): Message | undefined {
    return this._nowPlayingMessage;
  }

  setNowPlayingMessage(message: Message | undefined): void {
    this._nowPlayingMessage = message;
    this._nowPlayingIdle = false;
  }

  /** True once the live card has been switched to its idle placeholder. */
  get nowPlayingIdle(): boolean {
    return this._nowPlayingIdle;
  }

  set nowPlayingIdle(value: boolean) {
    this._nowPlayingIdle = value;
  }

  async connect(channel: VoiceBasedChannel): Promise<void> {
    return this.runExclusive(async () => {
      if (this.destroyed) throw new Error("Player is destroyed");
      this.clearIdleTimer();
      this.clearEmptyChannelTimer();

      if (channel.id !== this.channelId) {
        throw new Error("Voice channel mismatch for this player session");
      }
      if (this.connection) {
        if (this.connection.state.status === VoiceConnectionStatus.Ready) return;
        // Tear down a stale connection (Disconnected, Connecting…) so a fresh
        // one is established instead of returning a dead session.
        this.connection.destroy();
        this.connection = undefined;
      }

      this._state = "CONNECTING";
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      this.connection.on("error", (error) => {
        logger.error({ err: error, guild: this.guildId }, "Voice connection error");
      });

      this.connection.on("debug", (message) => {
        logger.debug({ guild: this.guildId, message }, "Voice connection debug");
      });

      this.connection.on("stateChange", (oldState, newState) => {
        logger.debug(
          {
            guild: this.guildId,
            from: oldState.status,
            to: newState.status,
          },
          "Voice connection state changed",
        );
      });

      this.connection.on(VoiceConnectionStatus.Disconnected, () => {
        void this.runExclusive(async () => {
          const connection = this.connection;
          if (!connection || this.destroyed) return;
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
            // The library is reconnecting to the channel on its own.
          } catch {
            logger.warn({ guild: this.guildId }, "Voice connection lost; next command will reconnect");
            if (this.connection === connection) {
              connection.destroy();
              this.connection = undefined;
              this._state = "IDLE";
            }
          }
        });
      });

      const subscription = this.connection.subscribe(this.audioPlayer);
      if (!subscription) {
        throw new Error("Unable to subscribe the audio player to the voice connection");
      }

      try {
        await entersState(this.connection, VoiceConnectionStatus.Ready, env.voiceConnectionTimeoutMs);
        this._state = this._currentTrack ? "PLAYING" : "IDLE";
        logger.info(
          {
            guild: this.guildId,
            channel: channel.id,
            wsPing: this.connection.ping.ws,
            udpPing: this.connection.ping.udp,
            privacyCode: this.connection.voicePrivacyCode ? "available" : "unavailable",
          },
          "Connected to voice channel",
        );
      } catch (error) {
        this.connection.destroy();
        this.connection = undefined;
        this._state = "ERROR";
        throw error;
      }
    });
  }

  async add(track: Track): Promise<AddTrackResult> {
    return this.runExclusive(async () => {
      this.clearIdleTimer();
      this.clearAutoplayRetry();
      this.autoplayCount = 0;
      if (!this._currentTrack && this.audioPlayer.state.status === AudioPlayerStatus.Idle) {
        await this.startTrack(track);
        return { started: true, position: 0 };
      }

      const position = this.queue.enqueue(track);
      logger.info({ guild: this.guildId, track: track.title, position }, "Added to queue");
      this.notifyQueueChange();
      return { started: false, position };
    });
  }

  async playNext(track: Track): Promise<AddTrackResult> {
    return this.runExclusive(async () => {
      this.clearIdleTimer();
      this.clearAutoplayRetry();
      this.autoplayCount = 0;
      if (!this._currentTrack && this.audioPlayer.state.status === AudioPlayerStatus.Idle) {
        await this.startTrack(track);
        return { started: true, position: 0 };
      }

      const position = this.queue.enqueueFront(track);
      logger.info({ guild: this.guildId, track: track.title }, "Queued next");
      this.notifyQueueChange();
      return { started: false, position };
    });
  }

  /**
   * Resumes playback from the in-memory queue (used after a restart). No-op if
   * a track is already playing or the connection is not ready.
   */
  async resumeFromQueue(): Promise<boolean> {
    return this.runExclusive(async () => {
      if (this.destroyed) return false;
      if (!this.connection || this.connection.state.status !== VoiceConnectionStatus.Ready) return false;
      if (this._currentTrack || this.audioPlayer.state.status !== AudioPlayerStatus.Idle) return true;
      this.clearAutoplayRetry();
      await this.playNextInternal();
      return this._currentTrack !== undefined;
    });
  }

  async voteSkip(userId: string, threshold: number): Promise<{ votes: number; skipped: boolean }> {
    return this.runExclusive(async () => {
      if (!this._currentTrack) return { votes: this.skipVotes.size, skipped: false };

      this.skipVotes.add(userId);
      const votes = this.skipVotes.size;

      if (votes >= threshold) {
        this.skipVotes.clear();
        this.bypassLoop = true;
        await this.killProcesses();
        this.audioPlayer.stop(true);
        return { votes, skipped: true };
      }

      return { votes, skipped: false };
    });
  }

  async playDiagnosticTone(): Promise<void> {
    return this.runExclusive(async () => {
      if (!this.connection || this.connection.state.status !== VoiceConnectionStatus.Ready) {
        throw new Error("Voice connection is not ready");
      }

      if (this._currentTrack || this.audioPlayer.state.status !== AudioPlayerStatus.Idle) {
        throw new Error("Stop the current playback before running /testaudio");
      }

      this.clearIdleTimer();
      await this.killProcesses();
      this._state = "BUFFERING";

      const ffmpeg = spawn(
        env.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "warning",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=48000:duration=3",
          "-f",
          "s16le",
          "-ar",
          "48000",
          "-ac",
          "2",
          "pipe:1",
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
        },
      );

      ffmpeg.stderr.on("data", (chunk: Buffer) => {
        logger.warn(
          { guild: this.guildId, ffmpeg: chunk.toString("utf8").trim() },
          "Diagnostic FFmpeg stderr",
        );
      });

      ffmpeg.on("error", (error) => {
        logger.error({ err: error, guild: this.guildId }, "Diagnostic FFmpeg process error");
      });

      ffmpeg.on("close", (code, signal) => {
        logger.info({ guild: this.guildId, code, signal }, "Diagnostic FFmpeg exited");
      });

      this.childProcesses = [ffmpeg];

      const resource = createAudioResource(ffmpeg.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      if (resource.volume) resource.volume.setVolume(percentToGain(this._volume, env.volumeHeadroomDb, env.volumeRangeDb));
      this.currentResource = resource;

      this.audioPlayer.play(resource);
      logger.info({ guild: this.guildId }, "Started 440 Hz diagnostic tone");
    });
  }

  async pause(): Promise<boolean> {
    return this.runExclusive(async () => this.audioPlayer.pause());
  }

  async resume(): Promise<boolean> {
    return this.runExclusive(async () => this.audioPlayer.unpause());
  }

  async skip(): Promise<boolean> {
    return this.runExclusive(async () => {
      if (!this._currentTrack) return false;
      this.bypassLoop = true;
      await this.killProcesses();
      return this.audioPlayer.stop(true);
    });
  }

  /** Restarts the current track at the given position (in seconds). */
  async seek(seconds: number): Promise<boolean> {
    return this.runExclusive(async () => {
      const track = this._currentTrack;
      if (!track) return false;

      const target = Math.max(0, Math.floor(seconds));
      if (track.duration !== undefined && target >= track.duration) {
        this.bypassLoop = true;
        await this.killProcesses();
        this.audioPlayer.stop(true);
        return true;
      }

      await this.reloadCurrent(track, target);
      return true;
    });
  }

  /** Replays the last finished track, if any. */
  async previous(): Promise<Track | undefined> {
    return this.runExclusive(async () => {
      const previous = this.history.pop();
      if (!previous) return undefined;

      if (this._currentTrack) {
        await this.reloadCurrent(previous, 0);
      } else {
        await this.startTrack(previous, 0);
      }
      return previous;
    });
  }

  private async reloadCurrent(track: Track, startSeconds: number): Promise<void> {
    this.suppressNextIdle = true;
    await this.killProcesses();
    this.audioPlayer.stop(true);
    await this.startTrack(track, startSeconds);
  }

  async stop(): Promise<void> {
    return this.runExclusive(async () => {
      this._state = "STOPPING";
      this.queue.clear();
      this._currentTrack = undefined;
      this.skipVotes.clear();
      this.bypassLoop = true;
      this.autoplayCount = 0;
      this.clearAutoplayRetry();
      await this.killProcesses();
      this.audioPlayer.stop(true);
      this._state = "IDLE";
      this.notifyQueueChange();
      this.scheduleIdleDisconnect();
    });
  }

  async destroy(): Promise<void> {
    return this.runExclusive(async () => this.destroyInternal());
  }

  handleHumansEmpty(): void {
    if (this.emptyChannelTimer || this.destroyed) return;
    // With autoplay ("radio") the bot keeps serving an empty channel for a
    // longer grace period before giving up.
    const timeoutSeconds = this._autoplay
      ? env.autoplayEmptyTimeoutSeconds
      : env.emptyChannelTimeoutSeconds;
    this.emptyChannelTimer = setTimeout(() => {
      void this.runExclusive(async () => this.destroyInternal());
    }, timeoutSeconds * 1000);
  }

  handleHumansPresent(): void {
    this.clearEmptyChannelTimer();
  }

  private async playNextInternal(finished?: Track): Promise<void> {
    // `seed` feeds autoplay lookups; `previous` drives loop semantics.
    const seed = finished;
    let previous = finished;
    // Each pass consumes one queue entry or one autoplay slot; the cap guards
    // against an unexpected retry cycle instead of recursing per failure.
    const maxPasses = env.maxQueueSize + Math.max(1, env.autoplayMaxConsecutive) + 1;

    let autoplayFailures = 0;

    for (let pass = 0; pass < maxPasses; pass++) {
      let next = decideNext(previous, this._loopMode, this.queue);
      let usedAutoplay = false;

      if (!next && seed && this._autoplay) {
        next = await this.resolveAutoplay(seed);
        usedAutoplay = next !== undefined;
      }

      if (!next) break;

      try {
        await this.startTrack(next);
        return;
      } catch (error) {
        logger.warn({ err: error, guild: this.guildId, track: next.title }, "Skipping unreadable track");
        // The command layer already reports a failed first track; auto-advance
        // failures have no caller, so surface them here (never for autoplay, to
        // avoid spamming the channel while the radio hunts for a playable one).
        if (!usedAutoplay) this.notifyTrackFailure(next, error);
        this._currentTrack = undefined;
        previous = undefined;
        // Do not hammer the related-track lookup when autoplay keeps failing.
        if (usedAutoplay && ++autoplayFailures >= 3) break;
      }
    }

    // User tracks always win, but when the queue is empty autoplay keeps the
    // station alive: never idle-disconnect while it can still find something.
    if (this._autoplay && seed && this.queue.isEmpty && this.autoplayCanContinue()) {
      this.scheduleAutoplayRetry(seed);
      return;
    }

    this.finishIdle();
  }

  private finishIdle(): void {
    this._state = "IDLE";
    this.notifyQueueChange();
    this.scheduleIdleDisconnect();
  }

  private autoplayCanContinue(): boolean {
    return env.autoplayMaxConsecutive <= 0 || this.autoplayCount < env.autoplayMaxConsecutive;
  }

  /** Low-frequency retry loop: keeps the bot connected when autoplay finds nothing. */
  private scheduleAutoplayRetry(seed: Track): void {
    if (this.destroyed || this.autoplayRetryTimer) return;
    if (!this.connection || this.connection.state.status !== VoiceConnectionStatus.Ready) {
      this.finishIdle();
      return;
    }

    this._state = "IDLE";
    this.notifyQueueChange();
    logger.info(
      { guild: this.guildId, seed: seed.title, retryMs: env.autoplayRetryMs },
      "Autoplay found nothing yet, retrying later",
    );

    this.autoplayRetryTimer = setTimeout(() => {
      this.autoplayRetryTimer = undefined;
      void this.runExclusive(async () => {
        if (this.destroyed) return;
        if (!this.connection || this.connection.state.status !== VoiceConnectionStatus.Ready) {
          this.finishIdle();
          return;
        }

        const related = await this.resolveAutoplay(seed);
        if (related) {
          try {
            await this.startTrack(related);
            return;
          } catch (error) {
            logger.warn(
              { err: error, guild: this.guildId, track: related.title },
              "Autoplay retry track failed to start",
            );
            this._currentTrack = undefined;
          }
        }

        if (this.autoplayCanContinue()) this.scheduleAutoplayRetry(seed);
        else this.finishIdle();
      });
    }, env.autoplayRetryMs);
  }

  private clearAutoplayRetry(): void {
    if (this.autoplayRetryTimer) clearTimeout(this.autoplayRetryTimer);
    this.autoplayRetryTimer = undefined;
  }

  private async resolveAutoplay(seed: Track): Promise<Track | undefined> {
    if (!this.onAutoplay) return undefined;
    if (!this.autoplayCanContinue()) {
      logger.info(
        { guild: this.guildId, count: this.autoplayCount, cap: env.autoplayMaxConsecutive },
        "Autoplay limit reached, stopping",
      );
      return undefined;
    }

    try {
      const related = await this.onAutoplay(seed, this.recentTrackIds);
      if (!related || this.recentTrackIds.has(related.id)) return undefined;
      this.autoplayCount += 1;
      logger.info(
        { guild: this.guildId, seed: seed.title, related: related.title, count: this.autoplayCount },
        "Autoplay selected a related track",
      );
      return related;
    } catch (error) {
      logger.warn({ err: error, guild: this.guildId, seed: seed.title }, "Autoplay lookup failed");
      return undefined;
    }
  }

  private rememberTrack(track: Track): void {
    this.recentTrackIds.delete(track.id);
    this.recentTrackIds.add(track.id);
    const limit = Math.max(1, env.autoplayHistory);
    if (this.recentTrackIds.size > limit) {
      const oldest = this.recentTrackIds.values().next().value;
      if (oldest !== undefined) this.recentTrackIds.delete(oldest);
    }
  }

  private pushHistory(track: Track): void {
    this.history.push(track);
    if (this.history.length > 25) this.history.shift();
  }

  private async startTrack(track: Track, startSeconds = 0): Promise<void> {
    if (!this.connection || this.connection.state.status !== VoiceConnectionStatus.Ready) {
      throw new Error("Voice connection is not ready");
    }

    this.clearIdleTimer();
    this._state = "BUFFERING";
    this._currentTrack = track;
    this._seekOffsetMs = Math.max(0, Math.floor(startSeconds)) * 1000;
    this.rememberTrack(track);
    this.skipVotes.clear();
    await this.killProcesses();
    this.notifyQueueChange();

    const attempts = Math.max(1, env.maxStreamRetries + 1);
    let lastError: unknown;

    this.startingTrack = true;
    try {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const { processes, resource } = await this.pipeline.create(track, this._volume, {
            filter: this._filter,
            startSeconds,
          });
          this.childProcesses = processes;
          this.currentResource = resource;
          this.audioPlayer.play(resource);
          // Guard against a stalled yt-dlp/FFmpeg pipe: without a watchdog the
          // player would sit in BUFFERING forever and block the serial queue.
          await this.waitForPlaybackStart();
          recordTrackStarted();
          logger.info(
            {
              guild: this.guildId,
              track: track.title,
              attempt,
              playableConnections: this.audioPlayer.playable.length,
            },
            "Audio resource submitted to player",
          );
          return;
        } catch (error) {
          lastError = error;
          logger.warn(
            { err: error, guild: this.guildId, track: track.title, attempt, attempts },
            "Track start attempt failed",
          );
          await this.killProcesses();
        }
      }
    } finally {
      this.startingTrack = false;
    }

    this._currentTrack = undefined;
    this._state = "ERROR";
    recordTrackFailed();
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Resolves once the player really starts reading audio. Rejects when the
   * player errors first or the stream never becomes readable within
   * `STREAM_START_TIMEOUT_MS`, signalling a dead pipe to the retry loop.
   */
  private waitForPlaybackStart(): Promise<void> {
    return waitForStatus(this.audioPlayer, AudioPlayerStatus.Playing, env.streamStartTimeoutMs);
  }

  private notifyTrackFailure(track: Track, error: unknown): void {
    if (!this.onNotify || !this._lastTextChannelId) return;
    const reason = error instanceof Error ? error.message : "erreur inconnue";
    try {
      this.onNotify(this._lastTextChannelId, `❌ Impossible de lire **${track.title}** : ${reason}`);
    } catch (notifyError) {
      logger.warn({ err: notifyError, guild: this.guildId }, "Failed to send error notification");
    }
  }

  private scheduleIdleDisconnect(): void {
    this.clearIdleTimer();
    if (!this.connection || this.destroyed) return;
    this.idleTimer = setTimeout(() => {
      void this.runExclusive(async () => this.destroyInternal());
    }, env.idleTimeoutSeconds * 1000);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  private clearEmptyChannelTimer(): void {
    if (this.emptyChannelTimer) clearTimeout(this.emptyChannelTimer);
    this.emptyChannelTimer = undefined;
  }

  private async killProcesses(): Promise<void> {
    const processes = this.childProcesses;
    this.childProcesses = [];
    if (processes.length === 0) return;

    await terminateAll(processes, {
      onForceKill: (process) =>
        logger.warn({ pid: process.pid }, "Force-killed process with SIGKILL after timeout"),
    });

    logger.debug({ count: processes.length }, "All child processes terminated");
  }

  private async destroyInternal(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
    this.clearEmptyChannelTimer();
    this.clearAutoplayRetry();
    this.queue.clear();
    this._currentTrack = undefined;
    this._lastTextChannelId = undefined;
    this.currentResource = undefined;
    const nowPlaying = this._nowPlayingMessage;
    this._nowPlayingMessage = undefined;
    this._nowPlayingIdle = false;
    if (nowPlaying) {
      void nowPlaying.delete().catch((error) => {
        logger.debug({ err: error, guild: this.guildId }, "Now playing card cleanup failed");
      });
    }
    this.skipVotes.clear();
    await this.killProcesses();
    this.audioPlayer.stop(true);
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    this.connection = undefined;
    this._state = "IDLE";
    this.onDestroyed(this.sessionId);
    logger.info({ guild: this.guildId, channel: this.channelId }, "Guild player destroyed");
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.serial.then(operation, operation);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }
}
