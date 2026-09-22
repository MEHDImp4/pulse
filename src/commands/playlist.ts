import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env";
import { preparePlayback } from "./helpers";
import { importPlaylist } from "./playlistImport";
import type { CommandDefinition } from "./types";

export const playlist: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("playlist")
    .setDescription("Ajoute une playlist YouTube à la file d'attente")
    .addStringOption((option) =>
      option
        .setName("url")
        .setDescription("URL de la playlist YouTube")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription(`Nombre maximum de morceaux (max ${env.playlistMaxItems})`)
        .setMinValue(1)
        .setMaxValue(env.playlistMaxItems)
        .setRequired(false),
    ),
  cooldownSeconds: 10,
  usage: "/playlist url:<URL> [limit:<n>]",
  async execute(interaction, { players }) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "❌ Cette commande doit être utilisée dans un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Acknowledge before any work so a slow lookup can never expire the token.
    await interaction.deferReply();

    const prep = await preparePlayback(interaction, players);
    if (prep.status === "error") {
      await interaction.editReply(prep.message);
      return;
    }
    const channel = prep.channel;

    const url = interaction.options.getString("url", true);
    const limit = interaction.options.getInteger("limit") ?? env.playlistMaxItems;

    await importPlaylist(interaction, players, channel, url, limit);
  },
};
