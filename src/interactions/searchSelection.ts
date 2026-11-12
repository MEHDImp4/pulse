import { MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import { preparePlayback } from "../commands/helpers";
import type { PlayerManager } from "../music/PlayerManager";
import { searchSelections } from "../services/searchSelection";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed, queuedEmbed } from "../ui/embeds";

export async function handleSearchSelection(
  interaction: StringSelectMenuInteraction, players: PlayerManager,
): Promise<boolean> {
  if (!interaction.customId.startsWith("search:")) return false;
  const id = interaction.customId.slice(7);
  const context = searchSelections.context(id, interaction.guildId, interaction.user.id);
  if (!context) {
    await interaction.reply({ content: "❌ Sélection expirée ou réservée à une autre personne.", flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const prep = await preparePlayback(interaction, players);
  if (prep.status === "error") {
    await interaction.editReply(prep.message);
    return true;
  }
  try {
    if (prep.channel.id !== context.channelId) {
      await interaction.editReply("❌ Reste dans le salon vocal de ta recherche.");
      return true;
    }
    const track = searchSelections.take(id, interaction.guildId, interaction.user.id, Number(interaction.values[0]));
    if (!track || !interaction.guildId) {
      await interaction.editReply("❌ Choix invalide ou déjà utilisé.");
      return true;
    }
    const player = players.getOrCreate(interaction.guildId, prep.channel.id);
    if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
    try {
      await player.connect(prep.channel);
    } catch (error) {
      await players.destroy(interaction.guildId, prep.channel.id);
      throw error;
    }
    const result = await player.add(track);
    if (result.started) {
      await interaction.editReply("▶️ Lecture lancée.");
      const msg = await interaction.followUp({
        embeds: [nowPlayingEmbed(player)],
        components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
        fetchReply: true,
      });
      player.setNowPlayingMessage(msg);
    } else {
      await interaction.editReply({ embeds: [queuedEmbed(track, { position: result.position })] });
    }
  } catch (error) {
    await interaction.editReply(`❌ Impossible de lancer la musique : ${error instanceof Error ? error.message : "Erreur inconnue"}`);
  } finally {
    prep.release();
  }
  return true;
}
