import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { env } from "../config/env";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed, queuedEmbed } from "../ui/embeds";
import { canJoinAndSpeak, ensureNoOtherGuildSession, memberVoiceChannel } from "./helpers";
import { importPlaylist } from "./playlistImport";
import type { CommandDefinition } from "./types";

export const play: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Recherche ou ajoute une musique YouTube")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Titre, recherche ou URL YouTube")
        .setAutocomplete(true)
        .setRequired(true),
    ),
  cooldownSeconds: 5,
  usage: "/play query:<texte ou URL>",
  async execute(interaction, { players }) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({ content: "❌ Cette commande doit être utilisée dans un serveur.", flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = await memberVoiceChannel(interaction);
    if (!channel) {
      await interaction.reply({ content: "❌ Tu dois être dans un salon vocal pour utiliser cette commande.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!canJoinAndSpeak(channel, interaction)) {
      await interaction.reply({ content: "❌ Je n'ai pas la permission de rejoindre ou parler dans ce salon.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!(await ensureNoOtherGuildSession(interaction, players, channel.id))) return;

    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    if (players.isPlaylistInput(query)) {
      await importPlaylist(interaction, players, channel, query, env.playlistMaxItems);
      return;
    }

    try {
      const track = await players.resolveTrack(query, {
        id: interaction.user.id,
        username: interaction.user.displayName || interaction.user.username,
      });

      const player = players.getOrCreate(interaction.guildId, channel.id);
      if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
      try {
        await player.connect(channel);
      } catch (error) {
        // Drop the half-initialized session so it does not linger as a ghost.
        await players.destroy(interaction.guildId, channel.id);
        throw error;
      }
      const result = await player.add(track);

      if (result.started) {
        await interaction.editReply({
          embeds: [nowPlayingEmbed(player)],
          components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
        });
      } else {
        await interaction.editReply({
          embeds: [queuedEmbed(track, { position: result.position })],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      await interaction.editReply(`❌ Impossible de lire ce morceau : ${message}`);
    }
  },
};
