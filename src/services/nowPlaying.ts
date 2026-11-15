import type { ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import type { GuildPlayer } from "../music/GuildPlayer";
import type { PlayerManager } from "../music/PlayerManager";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed } from "../ui/embeds";
import { logger } from "../utils/logger";

/** The fields whose value changes the rendered now-playing card. */
export interface NowPlayingSnapshot {
  trackId: string;
  state: string;
  elapsedSecond: number;
  volume: number;
  filter: string;
  loopMode: string;
  autoplay: boolean;
  queueSize: number;
}

/** Stable signature of the card; two equal signatures render identically. */
export function renderSignature(snapshot: NowPlayingSnapshot): string {
  return [
    snapshot.trackId,
    snapshot.state,
    snapshot.elapsedSecond,
    snapshot.volume,
    snapshot.filter,
    snapshot.loopMode,
    snapshot.autoplay ? "1" : "0",
    snapshot.queueSize,
  ].join("|");
}

export function playerSnapshot(player: GuildPlayer): NowPlayingSnapshot | undefined {
  const track = player.currentTrack;
  if (!track) return undefined;
  return {
    trackId: track.id,
    state: player.state,
    elapsedSecond: Math.floor((player.playbackElapsedMs ?? 0) / 1000),
    volume: player.volume,
    filter: player.filter,
    loopMode: player.loopMode,
    autoplay: player.autoplay,
    queueSize: player.queueSize,
  };
}

// Last rendered signature per session, so identical frames are not re-sent to
// Discord (e.g. a paused card no longer issues a REST edit every second).
const lastSignatures = new Map<string, string>();
// Serialize edits and creation for each player. Concurrent commands, button
// presses and timer ticks must not overwrite each other or duplicate cards.
const cardOperations = new WeakMap<GuildPlayer, Promise<void>>();
const MAX_SIGNATURES = 5_000;

async function withCardLock<T>(player: GuildPlayer, operation: () => Promise<T>): Promise<T> {
  const previous = cardOperations.get(player);
  let release!: () => void;
  const completed = new Promise<void>((resolve) => { release = resolve; });
  cardOperations.set(player, completed);
  if (previous) await previous;
  try {
    return await operation();
  } finally {
    if (cardOperations.get(player) === completed) cardOperations.delete(player);
    release();
  }
}

function isUnknownMessage(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 10008);
}

function rememberSignature(sessionId: string, signature: string): void {
  lastSignatures.delete(sessionId);
  lastSignatures.set(sessionId, signature);
  if (lastSignatures.size > MAX_SIGNATURES) {
    const oldest = lastSignatures.keys().next().value;
    if (oldest !== undefined) lastSignatures.delete(oldest);
  }
}

function buildPayload(player: GuildPlayer): {
  embeds: ReturnType<typeof nowPlayingEmbed>[];
  components: ReturnType<typeof playbackControlsRows>;
} {
  return {
    embeds: [nowPlayingEmbed(player)],
    components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
  };
}

/**
 * Publish a public, persistent music panel independently of the slash-command
 * response. Reuse the live card instead of accumulating one per /play.
 */
export async function publishNowPlaying(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  player: GuildPlayer,
): Promise<void> {
  await withCardLock(player, async () => {
    const existing = player.nowPlayingMessage;
    if (existing) {
      try {
        await existing.edit(buildPayload(player));
        player.setNowPlayingMessage(existing);
        lastSignatures.delete(player.sessionId);
        return;
      } catch (error) {
        // Transient network/rate-limit errors must never spawn a duplicate card.
        if (!isUnknownMessage(error)) throw error;
        logger.debug({ err: error, guild: player.guildId }, "Previous now-playing card was deleted");
      }
    }

    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      throw new Error("Je ne peux pas envoyer le panneau musical dans ce salon.");
    }

    const message = await channel.send({
      ...buildPayload(player),
      allowedMentions: { parse: [] },
    });
    player.setNowPlayingMessage(message);
    lastSignatures.delete(player.sessionId);
  });
}

/** Immediately re-renders the live now-playing panel (e.g. after a volume change). */
export async function refreshNowPlaying(player: GuildPlayer): Promise<void> {
  await withCardLock(player, async () => {
    const message = player.nowPlayingMessage;
    const snapshot = playerSnapshot(player);
    if (!message || !snapshot) return;

    const key = player.sessionId;
    const signature = renderSignature(snapshot);
    if (lastSignatures.get(key) === signature) return;

    try {
      await message.edit(buildPayload(player));
      rememberSignature(key, signature);
    } catch (error) {
      logger.debug({ err: error, guild: player.guildId }, "Immediate now playing update failed");
      lastSignatures.delete(key);
      if (isUnknownMessage(error) && player.nowPlayingMessage === message) player.setNowPlayingMessage(undefined);
    }
  });
}

/**
 * Skip timer ticks while any command owns the player's card. Every edit uses
 * the same lock, preventing stale timer updates and duplicate publications.
 */
export function startNowPlayingUpdater(players: PlayerManager, intervalMs = 5_000): () => void {
  const timer = setInterval(() => {
    for (const player of players.activePlayers()) {
      if (!player.nowPlayingMessage || cardOperations.has(player)) continue;

      void withCardLock(player, async () => {
        const message = player.nowPlayingMessage;
        if (!message) return;

        const key = player.sessionId;
        if (!player.currentTrack) {
          if (player.nowPlayingIdle) return;
          try {
            await message.edit({ embeds: [nowPlayingEmbed(player)], components: [] });
            player.nowPlayingIdle = true;
            lastSignatures.delete(key);
          } catch (error) {
            logger.debug({ err: error, guild: player.guildId }, "Now playing idle render failed");
            if (isUnknownMessage(error) && player.nowPlayingMessage === message) player.setNowPlayingMessage(undefined);
          }
          return;
        }

        player.nowPlayingIdle = false;
        if (player.state !== "PLAYING" && player.state !== "PAUSED") return;

        const snapshot = playerSnapshot(player);
        if (!snapshot) return;
        const signature = renderSignature(snapshot);
        if (lastSignatures.get(key) === signature) return;

        try {
          await message.edit(buildPayload(player));
          rememberSignature(key, signature);
        } catch (error) {
          logger.debug({ err: error, guild: player.guildId }, "Now playing update failed");
          lastSignatures.delete(key);
          if (isUnknownMessage(error) && player.nowPlayingMessage === message) player.setNowPlayingMessage(undefined);
        }
      }).catch((error) => {
        logger.debug({ err: error, guild: player.guildId }, "Now playing render failed");
      });
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
