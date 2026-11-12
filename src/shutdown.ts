import type { Client, TextChannel } from "discord.js";
import type { Logger } from "pino";
import type { PlayerManager } from "./music/PlayerManager";
import { listeningStats } from "./music/ListeningStats";

const DISCONNECT_MESSAGE = "ℹ️ Déconnexion du bot...";
const HARD_TIMEOUT_MS = 8_000;

export interface ShutdownDeps {
  client: Client;
  players: PlayerManager;
  logger: Logger;
}

export function createShutdown({ client, players, logger }: ShutdownDeps) {
  let shuttingDown = false;

  return async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, "Shutting down");

    const hardTimeout = setTimeout(() => {
      logger.fatal("Hard timeout reached, forcing exit");
      process.exit(1);
    }, HARD_TIMEOUT_MS);

    try {
      // Persist any pending per-session settings/queues before tearing down.
      players.flushSettings();
      players.flushQueues();
      listeningStats.flush();

      // Send disconnect messages for every active playback session.
      const activePlayers = players.activePlayers();
      if (activePlayers.length > 0) {
        const sendResults = await Promise.allSettled(
          activePlayers.map(async (player) => {
            const guild = await client.guilds.fetch(player.guildId).catch(() => null);
            if (!guild) return;

            let channel: TextChannel | null = null;

            if (player.lastTextChannelId) {
              const fetched = await guild.channels.fetch(player.lastTextChannelId).catch(() => null);
              if (fetched?.isTextBased() && !fetched.isDMBased()) {
                channel = fetched as TextChannel;
              }
            }

            if (!channel && guild.systemChannel) {
              channel = guild.systemChannel;
            }

            if (channel) {
              await channel.send(DISCONNECT_MESSAGE).catch((err) => {
                logger.warn({ err, guild: player.guildId, channel: player.channelId }, "Failed to send disconnect message");
              });
            }
          }),
        );

        for (const result of sendResults) {
          if (result.status === "rejected") {
            logger.warn({ err: result.reason }, "Failed to send disconnect message to guild");
          }
        }
      }

      // Destroy all players (PROC-02, PROC-03)
      await players.destroyAll();

      // Destroy client - await for clean WebSocket close
      await client.destroy();

      clearTimeout(hardTimeout);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "Error during shutdown");
      clearTimeout(hardTimeout);
      process.exit(1);
    }
  };
}
