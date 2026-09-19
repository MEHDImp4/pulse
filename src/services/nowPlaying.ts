import type { GuildPlayer } from "../music/GuildPlayer";
import type { PlayerManager } from "../music/PlayerManager";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed } from "../ui/embeds";
import { logger } from "../utils/logger";

/** Immediately re-renders the live now-playing panel (e.g. after a volume change). */
export async function refreshNowPlaying(player: GuildPlayer): Promise<void> {
  const message = player.nowPlayingMessage;
  if (!message || !player.currentTrack) return;
  try {
    await message
      .edit({
        embeds: [nowPlayingEmbed(player)],
        components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
      })
      .catch((error) => {
        logger.debug({ err: error, guild: player.guildId }, "Immediate now playing update failed");
      });
  } catch (error) {
    logger.debug({ err: error, guild: player.guildId }, "Immediate now playing render failed");
  }
}

/**
 * Periodically refreshes the live now-playing card. When the queue ends the
 * card is switched once to its idle placeholder (no components); it is deleted
 * when the player is destroyed (bot leaves the voice channel). Skips a tick
 * while a previous edit for the same session is still in flight, so a 1s
 * interval cannot pile up requests. Returns a stop function.
 */
export function startNowPlayingUpdater(players: PlayerManager, intervalMs = 1_000): () => void {
  const inFlight = new Set<string>();

  const timer = setInterval(() => {
    for (const player of players.activePlayers()) {
      const message = player.nowPlayingMessage;
      if (!message) continue;

      const key = player.sessionId;
      if (inFlight.has(key)) continue;

      if (!player.currentTrack) {
        if (!player.nowPlayingIdle) {
          player.nowPlayingIdle = true;
          inFlight.add(key);
          void message
            .edit({ embeds: [nowPlayingEmbed(player)], components: [] })
            .catch((error) => {
              logger.debug({ err: error, guild: player.guildId }, "Now playing idle render failed");
            })
            .finally(() => inFlight.delete(key));
        }
        continue;
      }

      player.nowPlayingIdle = false;

      if (player.state !== "PLAYING" && player.state !== "PAUSED") continue;

      // Building the embed synchronously can throw on invalid remote URLs; a
      // throw here would otherwise escape the setInterval and crash the process.
      try {
        const payload = {
          embeds: [nowPlayingEmbed(player)],
          components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
        };
        inFlight.add(key);
        void message
          .edit(payload)
          .catch((error) => {
            logger.debug({ err: error, guild: player.guildId }, "Now playing update failed");
            player.setNowPlayingMessage(undefined);
          })
          .finally(() => inFlight.delete(key));
      } catch (error) {
        logger.debug({ err: error, guild: player.guildId }, "Now playing render failed");
        player.setNowPlayingMessage(undefined);
      }
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
