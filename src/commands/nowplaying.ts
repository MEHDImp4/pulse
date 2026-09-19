import { SlashCommandBuilder } from "discord.js";
import { replyTemporary } from "../utils/reply";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed } from "../ui/embeds";
import { resolveReadPlayer } from "./helpers";
import type { CommandDefinition } from "./types";

export const nowplaying: CommandDefinition = {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Affiche le morceau actuellement joué"),
  usage: "/nowplaying",
  async execute(interaction, { players }) {
    const result = await resolveReadPlayer(interaction, players);
    const track = result.status === "ok" ? result.player.currentTrack : undefined;
    if (result.status !== "ok" || !track) {
      await replyTemporary(
        interaction,
        result.status === "notGuild"
          ? "❌ Cette commande doit être utilisée dans un serveur."
          : "ℹ️ Aucun morceau n'est actuellement joué.",
      );
      return;
    }
    const player = result.player;

    const message = await interaction.reply({
      embeds: [nowPlayingEmbed(player)],
      components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
      fetchReply: true,
    });

    player.setNowPlayingMessage(message);
  },
};
