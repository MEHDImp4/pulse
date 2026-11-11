import { ActionRowBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import { searchSelections } from "../services/searchSelection";
import { formatDuration } from "../utils/time";
import { canJoinAndSpeak, memberVoiceChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const search: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Recherche cinq titres et te laisse choisir")
    .addStringOption((o) => o.setName("query").setDescription("Titre ou artiste").setRequired(true)),
  usage: "/search query:<texte>",
  cooldownSeconds: 5,
  async execute(interaction, { players }) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "❌ Serveur requis.", flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = await memberVoiceChannel(interaction);
    if (!channel || !canJoinAndSpeak(channel, interaction)) {
      await interaction.reply({ content: "❌ Rejoins un salon vocal accessible.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const query = interaction.options.getString("query", true);
    try {
      const tracks = await players.searchChoices(query, {
        id: interaction.user.id,
        username: interaction.user.displayName || interaction.user.username,
      }, 5);
      if (tracks.length === 0) {
        await interaction.editReply("❌ Aucun résultat.");
        return;
      }
      const id = searchSelections.create({
        guildId: interaction.guildId, userId: interaction.user.id, channelId: channel.id, tracks,
      });
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`search:${id}`)
        .setPlaceholder("Choisis ton morceau")
        .addOptions(tracks.map((track, index) => ({
          label: track.title.slice(0, 100),
          description: `${track.author ?? "YouTube"} · ${track.duration === undefined ? "?" : formatDuration(track.duration)}`.slice(0, 100),
          value: String(index),
        })));
      await interaction.editReply({
        content: `**${query.slice(0, 120)}** — sélection valable 2 minutes :`,
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      });
    } catch (error) {
      await interaction.editReply(`❌ Recherche impossible : ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    }
  },
};
