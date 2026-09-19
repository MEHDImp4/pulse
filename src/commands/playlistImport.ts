import type { ChatInputCommandInteraction, VoiceBasedChannel } from "discord.js";
import type { PlayerManager } from "../music/PlayerManager";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed, playlistImportedEmbed } from "../ui/embeds";

/** Resolves a playlist URL and enqueues as many tracks as fit. Assumes the interaction is deferred. */
export async function importPlaylist(
  interaction: ChatInputCommandInteraction,
  players: PlayerManager,
  channel: VoiceBasedChannel,
  url: string,
  limit: number,
): Promise<void> {
  if (!interaction.guildId) return;

  const requestedBy = {
    id: interaction.user.id,
    username: interaction.user.displayName || interaction.user.username,
  };

  try {
    const result = await players.resolvePlaylist(url, requestedBy, limit);
    if (result.tracks.length === 0) {
      await interaction.editReply("❌ Aucun morceau lisible trouvé dans cette playlist.");
      return;
    }

    const player = players.getOrCreate(interaction.guildId, channel.id);
    if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
    try {
      await player.connect(channel);
    } catch (error) {
      await players.destroy(interaction.guildId, channel.id);
      throw error;
    }

    const wasIdle = !player.currentTrack;

    let added = 0;
    for (const track of result.tracks) {
      try {
        await player.add(track);
        added += 1;
      } catch {
        break;
      }
    }

    await interaction.editReply({
      embeds: [
        playlistImportedEmbed({
          title: result.title,
          added,
          limit,
          partial: added < result.tracks.length,
          limitReached: result.tracks.length >= limit,
        }),
      ],
    });

    // Post the live now-playing card when this import actually started playback.
    if (wasIdle && player.currentTrack) {
      const card = await interaction.followUp({
        embeds: [nowPlayingEmbed(player)],
        components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
        fetchReply: true,
      });
      player.setNowPlayingMessage(card);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await interaction.editReply(`❌ Impossible d'importer la playlist : ${message}`);
  }
}
