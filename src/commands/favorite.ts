import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { resolveReadPlayer, preparePlayback } from "./helpers";
import type { CommandDefinition } from "./types";

export const favorite: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("favorite").setDescription("Gère tes musiques favorites")
    .addSubcommand((s) => s.setName("add").setDescription("Ajoute la musique en cours"))
    .addSubcommand((s) => s.setName("list").setDescription("Liste tes favoris"))
    .addSubcommand((s) => s.setName("remove").setDescription("Retire un favori")
      .addIntegerOption((o) => o.setName("position").setDescription("Numéro du favori").setMinValue(1).setRequired(true)))
    .addSubcommand((s) => s.setName("play").setDescription("Joue un favori")
      .addIntegerOption((o) => o.setName("position").setDescription("Numéro du favori").setMinValue(1).setRequired(true))),
  usage: "/favorite add|list|remove|play",
  async execute(interaction, { players, library }) {
    const userId = interaction.user.id;
    const action = interaction.options.getSubcommand();
    if (action === "list") {
      const lines = library.favorites(userId).slice(0, 40).map((song, i) => `${i + 1}. ${song.title}`);
      await interaction.reply({ content: lines.length ? lines.join("\n").slice(0, 1900) : "ℹ️ Aucun favori.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "add") {
      const result = await resolveReadPlayer(interaction, players);
      const track = result.status === "ok" ? result.player.currentTrack : undefined;
      await interaction.reply({ content: !track ? "❌ Aucun morceau en cours." : library.addFavorite(userId, track) ? "❤️ Musique ajoutée aux favoris." : "ℹ️ Déjà dans les favoris.", flags: MessageFlags.Ephemeral });
      return;
    }
    const position = interaction.options.getInteger("position", true);
    if (action === "remove") {
      const removed = library.removeFavorite(userId, position);
      await interaction.reply({ content: removed ? `🗑️ Favori retiré : ${removed.title}` : "❌ Favori introuvable.", flags: MessageFlags.Ephemeral });
      return;
    }
    const selected = library.favorites(userId)[position - 1];
    if (!selected) {
      await interaction.reply({ content: "❌ Favori introuvable.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const prep = await preparePlayback(interaction, players);
    if (prep.status === "error") {
      await interaction.editReply(prep.message);
      return;
    }
    try {
      const track = await players.resolveTrack(selected.url, { id: userId, username: interaction.user.username });
      const player = players.getOrCreate(interaction.guildId!, prep.channel.id);
      if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
      try { await player.connect(prep.channel); } catch (error) {
        await players.destroy(interaction.guildId!, prep.channel.id);
        throw error;
      }
      const result = await player.add(track);
      await interaction.editReply(result.started ? `▶️ ${track.title}` : `✅ Ajouté à la file (#${result.position}) : ${track.title}`);
    } catch (error) {
      await interaction.editReply(`❌ Favori indisponible : ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    } finally {
      prep.release();
    }
  },
};
