import { generateDependencyReport } from "@discordjs/voice";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commands, commandMap } from "./commands";
import type { CommandContext } from "./commands/types";
import { handleMusicControl } from "./interactions/musicControls";
import { handleQueuePagination } from "./interactions/queuePagination";
import { env } from "./config/env";
import { PlayerManager } from "./music/PlayerManager";
import { createProviderRegistry } from "./providers";
import { YouTubeSuggestions } from "./services/suggestions";
import { startNowPlayingUpdater } from "./services/nowPlaying";
import { createShutdown } from "./shutdown";
import { clearCooldowns, checkCooldown } from "./utils/cooldown";
import { verifyExternalTools } from "./utils/externalTools";
import { logger } from "./utils/logger";
import { createThrottle } from "./utils/throttle";

logger.info(
  { node: process.version, report: generateDependencyReport() },
  "Discord voice dependency report",
);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  // Never ping users/roles/everyone from titles or user input echoed back.
  allowedMentions: { parse: [] },
});

const players = new PlayerManager(createProviderRegistry(), client);
const suggestions = new YouTubeSuggestions(env.suggestTimeoutMs);
// Bound per-user outbound suggestion lookups; Discord sends one request per keystroke.
const autocompleteThrottle = createThrottle(300);
const commandContext: CommandContext = { players, commands };

void verifyExternalTools();

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ user: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, "Discord client ready");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
    return;
  }

  if (interaction.isButton()) {
    try {
      if (await handleMusicControl(interaction, players)) return;
      if (await handleQueuePagination(interaction, players)) return;
    } catch (error) {
      logger.error(
        { err: error, customId: interaction.customId, guild: interaction.guildId },
        "Button interaction failed",
      );
      const message = "❌ Impossible d'exécuter cette action.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const command = commandMap.get(interaction.commandName);
  if (!command) return;

  const cooldownMs = (command.cooldownSeconds ?? env.commandCooldownSeconds) * 1000;
  const remaining = checkCooldown(`${interaction.user.id}:${command.data.name}`, cooldownMs);
  if (remaining !== null) {
    await interaction
      .reply({ content: `⏳ Patiente encore ${remaining} seconde(s) avant de réutiliser cette commande.`, flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  try {
    await command.execute(interaction, commandContext);
  } catch (error) {
    logger.error({ err: error, command: interaction.commandName, guild: interaction.guildId }, "Command failed");
    const message = "❌ Une erreur inattendue est survenue.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => undefined);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
});

async function handleAutocomplete(interaction: import("discord.js").AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (!env.autocompleteEnabled || !["play", "playnext"].includes(interaction.commandName) || focused.name !== "query") {
    await interaction.respond([]).catch(() => undefined);
    return;
  }

  if (!autocompleteThrottle.allow(interaction.user.id)) {
    await interaction.respond([]).catch(() => undefined);
    return;
  }

  const choices = await suggestions.suggest(String(focused.value ?? ""));
  await interaction.respond(choices).catch(() => undefined);
}

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guild = newState.guild ?? oldState.guild;

  for (const player of players.getForGuild(guild.id)) {
    const channel = guild.channels.cache.get(player.channelId);
    if (!channel?.isVoiceBased()) continue;

    const humanCount = channel.members.filter((member) => !member.user.bot).size;
    if (humanCount === 0) player.handleHumansEmpty();
    else player.handleHumansPresent();
  }
});

const stopNowPlayingUpdater = env.nowPlayingLive
  ? startNowPlayingUpdater(players, env.nowPlayingIntervalMs)
  : () => undefined;

const shutdown = createShutdown({ client, players, logger });

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  stopNowPlayingUpdater();
  clearCooldowns();
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.once("SIGINT", () => {
  stopNowPlayingUpdater();
  clearCooldowns();
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  stopNowPlayingUpdater();
  clearCooldowns();
  void shutdown("SIGTERM");
});

client.login(env.discordToken).catch((error) => {
  logger.fatal({ err: error }, "Unable to login to Discord");
  process.exitCode = 1;
});
