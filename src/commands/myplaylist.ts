import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { preparePlayback, resolveReadPlayer } from "./helpers";
import type { CommandDefinition } from "./types";

export const myplaylist: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("myplaylist").setDescription("Sauvegarde et rejoue tes playlists")
    .addSubcommand((s) => s.setName("save").setDescription("Sauvegarde la file actuelle")
      .addStringOption((o) => o.setName("name").setDescription("Nom de la playlist").setMaxLength(40).setRequired(true)))
    .addSubcommand((s) => s.setName("list").setDescription("Liste tes playlists"))
    .addSubcommand((s) => s.setName("delete").setDescription("Supprime une playlist")
      .addStringOption((o) => o.setName("name").setDescription("Nom").setRequired(true)))
    .addSubcommand((s) => s.setName("load").setDescription("Charge la playlist dans le vocal")
      .addStringOption((o) => o.setName("name").setDescription("Nom").setRequired(true))),
  cooldownSeconds: 5,
  usage: "/myplaylist save|list|delete|load",
  async execute(interaction, { players, library }) {
    const userId = interaction.user.id;
    const action = interaction.options.getSubcommand();
    if (action === "list") {
      const lists = library.playlists(userId);
      await interaction.reply({ content: lists.length ? lists.map((l) => `• ${l.name} — ${l.count} titres`).join("\n").slice(0, 1900) : "ℹ️ Aucune playlist enregistrée.", flags: MessageFlags.Ephemeral });
      return;
    }
    const name = interaction.options.getString("name", true);
    if (action === "delete") {
      await interaction.reply({ content: library.removePlaylist(userId, name) ? "🗑️ Playlist supprimée." : "❌ Playlist introuvable.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (action === "save") {
      const found = await resolveReadPlayer(interaction, players);
      if (found.status !== "ok") {
        await interaction.reply({ content: "❌ Aucun lecteur actif dans ce serveur.", flags: MessageFlags.Ephemeral });
        return;
      }
      const current = found.player.currentTrack;
      const tracks = [...(current ? [current] : []), ...found.player.queue.snapshot()];
      const count = library.savePlaylist(userId, name, tracks);
      await interaction.reply({ content: `✅ Playlist « ${name} » enregistrée (${count} titres).`, flags: MessageFlags.Ephemeral });
      return;
    }
    const saved = library.playlist(userId, name);
    if (!saved) {
      await interaction.reply({ content: "❌ Playlist introuvable.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const prep = await preparePlayback(interaction, players);
    if (prep.status === "error") {
      await interaction.editReply(prep.message);
      return;
    }
    try {
      let added = 0, missing = 0;
      const player = players.getOrCreate(interaction.guildId!, prep.channel.id);
      if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
      try { await player.connect(prep.channel); } catch (error) {
        await players.destroy(interaction.guildId!, prep.channel.id);
        throw error;
      }
      for (const song of saved) {
        if (player.queue.isFull) break;
        try {
          const track = await players.resolveTrack(song.url, { id: userId, username: interaction.user.username });
          await player.add(track);
          added++;
        } catch { missing++; }
      }
      await interaction.editReply(`✅ ${added} morceaux ajoutés depuis « ${name} »${missing ? ` (${missing} indisponibles)` : ""}.`);
    } catch (error) {
      await interaction.editReply(`❌ Chargement impossible : ${error instanceof Error ? error.message : "Erreur inconnue"}`);
    } finally {
      prep.release();
    }
  },
};
