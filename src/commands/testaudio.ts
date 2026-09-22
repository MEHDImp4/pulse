import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { preparePlayback } from "./helpers";
import type { CommandDefinition } from "./types";

export const testaudio: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("testaudio")
    .setDescription("Joue un bip local de 3 secondes pour tester Discord Voice"),
  usage: "/testaudio",
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

    try {
      const player = players.getOrCreate(interaction.guildId, channel.id);
      if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
      try {
        await player.connect(channel);
      } catch (error) {
        await players.destroy(interaction.guildId, channel.id);
        throw error;
      }
      await player.playDiagnosticTone();
      await interaction.editReply("🔊 Test audio lancé : tu dois entendre un bip de 440 Hz pendant 3 secondes.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      await interaction.editReply(`❌ Test audio impossible : ${message}`);
    }
  },
};
