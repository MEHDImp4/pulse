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
 * Periodically refreshes the progress bar of the live /nowplaying message.
 * Returns a stop function.
 */
export function startNowPlayingUpdater(players: PlayerManager, intervalMs = 10_000): () => void {
  const timer = setInterval(() => {
    for (const player of players.activePlayers()) {
      const message = player.nowPlayingMessage;
      if (!message) continue;

      if (!player.currentTrack) {
        player.setNowPlayingMessage(undefined);
        continue;
      }

      if (player.state !== "PLAYING" && player.state !== "PAUSED") continue;

      // Building the embed synchronously can throw on invalid remote URLs; a
      // throw here would otherwise escape the setInterval and crash the process.
      try {
        const payload = {
          embeds: [nowPlayingEmbed(player)],
          components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
        };
        void message.edit(payload).catch((error) => {
          logger.debug({ err: error, guild: player.guildId }, "Now playing update failed");
          player.setNowPlayingMessage(undefined);
        });
      } catch (error) {
        logger.debug({ err: error, guild: player.guildId }, "Now playing render failed");
        player.setNowPlayingMessage(undefined);
      }
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
