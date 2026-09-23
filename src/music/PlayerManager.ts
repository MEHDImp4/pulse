import { join } from "node:path";
import type { Client } from "discord.js";
import { env } from "../config/env";
import type { AudioProvider, PlaylistResult } from "../providers/AudioProvider";
import { isPlaylistUrl } from "../providers/youtube";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed } from "../ui/embeds";
import { logger } from "../utils/logger";
import { GuildPlayer } from "./GuildPlayer";
import { GuildSettingsStore, type GuildSettings } from "./GuildSettingsStore";
import { QueueStore } from "./QueueStore";
import { findConflictingSession, toSessionId } from "./session";
import type { RequestedBy, Track } from "./Track";

export class PlayerManager {
  private readonly players = new Map<string, GuildPlayer>();
  private readonly settings: GuildSettingsStore;
  private readonly queueStore?: QueueStore;

  constructor(
    private readonly provider: AudioProvider,
    private readonly client?: Client,
  ) {
    this.settings = new GuildSettingsStore(join(env.dataDir, "guild-settings.json"));
    this.settings.load();

    if (env.queuePersist) {
      this.queueStore = new QueueStore(join(env.dataDir, "queues.json"), env.queuePersistDebounceMs);
      this.queueStore.load();
    }
  }

  /** Returns the player bound to a specific voice channel, if any. */
  get(guildId: string, channelId: string): GuildPlayer | undefined {
    return this.players.get(toSessionId(guildId, channelId));
  }

  /**
   * Returns every player of a guild. Discord allows a single voice channel per
   * guild per bot, so at most one of them is connected at a time.
   */
  getForGuild(guildId: string): GuildPlayer[] {
    const prefix = `${guildId}:`;
    return [...this.players.entries()]
      .filter(([sessionId]) => sessionId.startsWith(prefix))
      .map(([, player]) => player);
  }

  /**
   * Returns the guild's active session when it sits in another voice channel.
   * Used to refuse a second session instead of silently hijacking the
   * existing voice connection.
   */
  findGuildConflict(guildId: string, channelId: string): GuildPlayer | undefined {
    return findConflictingSession(this.getForGuild(guildId), channelId);
  }

  /** Returns the player currently attached to a voice channel, across guilds. */
  getForChannel(channelId: string): GuildPlayer | undefined {
    return [...this.players.values()].find((player) => player.channelId === channelId);
  }

  /**
   * Rebinds a session after Discord moves the bot to another voice channel.
   * Keeps the live connection and playback, re-keys the registry and migrates
   * the session-scoped settings and persisted queue. Returns the rebinding
   * player, or undefined when no session exists in the source channel.
   */
  rebind(guildId: string, fromChannelId: string, toChannelId: string): GuildPlayer | undefined {
    if (fromChannelId === toChannelId) return this.get(guildId, toChannelId);

    const fromId = toSessionId(guildId, fromChannelId);
    const toId = toSessionId(guildId, toChannelId);
    const player = this.players.get(fromId);
    if (!player) return this.get(guildId, toChannelId);

    this.players.delete(fromId);
    player.bindChannel(toChannelId);
    this.players.set(toId, player);
    this.settings.moveSession(fromId, toId);
    this.queueStore?.move(fromId, toId, toChannelId);

    logger.info(
      { guild: guildId, from: fromChannelId, to: toChannelId },
      "Rebound session to new voice channel",
    );
    return player;
  }

  getOrCreate(guildId: string, channelId: string): GuildPlayer {
    const sessionId = toSessionId(guildId, channelId);
    const existing = this.players.get(sessionId);
    if (existing) return existing;

    const player = new GuildPlayer(
      guildId,
      channelId,
      this.provider,
      (id) => {
        if (this.players.get(id) === player) this.players.delete(id);
      },
      (textChannelId, content) => {
        void this.notify(textChannelId, content);
      },
      this.settings.get(sessionId, guildId),
      (patch) => {
        this.settings.update(sessionId, guildId, patch);
      },
      (changed) => {
        this.persistQueue(changed);
      },
      (seed, exclude) => this.autoplayRelated(seed, exclude),
    );
    this.players.set(sessionId, player);
    this.restoreQueue(player);
    return player;
  }

  private async autoplayRelated(seed: Track, exclude: ReadonlySet<string>): Promise<Track | undefined> {
    if (!this.provider.related) return undefined;
    return this.provider.related(seed, exclude);
  }

  private restoreQueue(player: GuildPlayer): void {
    const persisted = this.queueStore?.get(player.sessionId);
    if (!persisted) return;

    const ordered = [persisted.current, ...persisted.tracks].filter(
      (track): track is Track => track !== undefined,
    );

    let restored = 0;
    for (const track of ordered) {
      try {
        player.queue.enqueue(track);
        restored += 1;
      } catch {
        break;
      }
    }

    if (restored > 0) {
      logger.info({ guild: player.guildId, channel: player.channelId, tracks: restored }, "Restored persisted queue");
    }
  }

  private persistQueue(player: GuildPlayer): void {
    if (!this.queueStore) return;
    const tracks = [...player.queue.snapshot()];
    const current = player.currentTrack;

    if (!current && tracks.length === 0) {
      this.queueStore.delete(player.sessionId);
      return;
    }

    this.queueStore.set(player.sessionId, {
      guildId: player.guildId,
      channelId: player.channelId,
      textChannelId: player.lastTextChannelId,
      current,
      tracks,
    });
  }

  private async notify(channelId: string, content: string): Promise<void> {
    if (!this.client) return;
    try {
      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send({ content, allowedMentions: { parse: [] } });
      }
    } catch (error) {
      logger.warn({ err: error, channelId }, "Failed to deliver notification");
    }
  }

  /**
   * Rejoins recent persisted sessions and resumes playback after a restart.
   * Sessions whose guild/channel is gone are dropped instead of retried.
   */
  async resumeSessionsOnStartup(): Promise<void> {
    if (!this.queueStore || !this.client) return;

    const cutoff = Date.now() - env.resumeMaxAgeMinutes * 60_000;

    for (const [sessionId, entry] of this.queueStore.entries()) {
      if (entry.savedAt < cutoff || (entry.tracks.length === 0 && !entry.current)) {
        this.queueStore.delete(sessionId);
        continue;
      }

      try {
        const guild = await this.client.guilds.fetch(entry.guildId).catch(() => null);
        if (!guild) {
          this.queueStore.delete(sessionId);
          continue;
        }

        const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
        if (!channel || !channel.isVoiceBased()) {
          logger.warn(
            { guild: entry.guildId, channel: entry.channelId },
            "Persisted session channel unavailable, dropping",
          );
          this.queueStore.delete(sessionId);
          continue;
        }

        const player = this.getOrCreate(entry.guildId, entry.channelId);
        if (entry.textChannelId) player.lastTextChannelId = entry.textChannelId;
        await player.connect(channel);
        const resumed = await player.resumeFromQueue();
        logger.info(
          { guild: entry.guildId, channel: entry.channelId, resumed },
          "Resumed persisted session",
        );
        if (resumed) await this.announceNowPlaying(player);
      } catch (error) {
        logger.warn(
          { err: error, guild: entry.guildId, channel: entry.channelId },
          "Failed to resume persisted session",
        );
      }
    }
  }

  /** Best-effort repost of the now-playing card in the last known text channel. */
  private async announceNowPlaying(player: GuildPlayer): Promise<void> {
    if (!this.client || !player.lastTextChannelId || !player.currentTrack) return;
    try {
      const channel = await this.client.channels.fetch(player.lastTextChannelId).catch(() => null);
      if (!channel?.isTextBased() || channel.isDMBased()) return;
      const message = await channel.send({
        embeds: [nowPlayingEmbed(player)],
        components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
      });
      player.setNowPlayingMessage(message);
    } catch (error) {
      logger.warn({ err: error, guild: player.guildId }, "Failed to announce resumed now-playing card");
    }
  }

  async destroy(guildId: string, channelId: string): Promise<void> {
    const sessionId = toSessionId(guildId, channelId);
    const player = this.players.get(sessionId);
    if (player) await player.destroy();
    this.players.delete(sessionId);
    this.queueStore?.delete(sessionId);
  }

  async destroyAll(): Promise<void> {
    await Promise.all([...this.players.values()].map((player) => player.destroy()));
    this.players.clear();
  }

  getGuildSettings(sessionId: string, guildId: string): GuildSettings {
    return this.settings.get(sessionId, guildId);
  }

  /** Persists any pending guild settings immediately. */
  flushSettings(): void {
    this.settings.flush();
  }

  /** Persists all in-memory queues immediately. */
  flushQueues(): void {
    if (!this.queueStore) return;
    for (const player of this.players.values()) this.persistQueue(player);
    this.queueStore.flush();
  }

  isPlaylistInput(input: string): boolean {
    return isPlaylistUrl(input.trim());
  }

  async resolvePlaylist(input: string, requestedBy: RequestedBy, limit?: number): Promise<PlaylistResult> {
    if (!this.provider.resolvePlaylist) {
      throw new Error("Les playlists ne sont pas supportées par ce fournisseur");
    }

    const result = await this.provider.resolvePlaylist(
      input.trim(),
      requestedBy,
      limit ?? env.playlistMaxItems,
    );

    const maxSeconds = env.maxTrackDurationMinutes * 60;
    const tracks =
      maxSeconds > 0
        ? result.tracks.filter((track) => track.duration === undefined || track.duration <= maxSeconds)
        : result.tracks;

    return { title: result.title, tracks };
  }

  async resolveTrack(input: string, requestedBy: RequestedBy): Promise<Track> {
    const trimmed = input.trim();
    const track = /^https?:\/\//i.test(trimmed)
      ? await this.provider.resolve(trimmed, requestedBy)
      : await this.provider.search(trimmed, requestedBy);

    const maxSeconds = env.maxTrackDurationMinutes * 60;
    if (track.duration !== undefined && maxSeconds > 0 && track.duration > maxSeconds) {
      throw new Error(`Track exceeds maximum duration of ${env.maxTrackDurationMinutes} minutes`);
    }

    return track;
  }

  get size(): number {
    return this.players.size;
  }

  get activeGuildIds(): string[] {
    const guildIds = new Set<string>();
    for (const player of this.players.values()) {
      if (player.isConnected) guildIds.add(player.guildId);
    }
    return [...guildIds];
  }

  activePlayers(): GuildPlayer[] {
    return [...this.players.values()].filter((player) => player.isConnected);
  }

  /** Every known session, connected or not (for diagnostics/metrics). */
  allPlayers(): GuildPlayer[] {
    return [...this.players.values()];
  }
}
