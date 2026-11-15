import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { publishNowPlaying } from "../services/nowPlaying";
import { scheduleInteractionReplyDeletion } from "../utils/reply";
import { resolveReadPlayer } from "./helpers";
import type { CommandDefinition } from "./types";

export const nowplaying: CommandDefinition = {
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Affiche le morceau actuellement joué"),
  usage: "/nowplaying",
  async execute(interaction, { players }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await resolveReadPlayer(interaction, players);
    const track = result.status === "ok" ? result.player.currentTrack : undefined;
    if (result.status !== "ok" || !track) {
      await interaction.editReply(
        result.status === "notGuild"
          ? "❌ Cette commande doit être utilisée dans un serveur."
          : "ℹ️ Aucun morceau n'est actuellement joué.",
      );
      return;
    }

    await publishNowPlaying(interaction, result.player);
    await interaction.editReply("🎵 Panneau musical mis à jour.");
    scheduleInteractionReplyDeletion(interaction);
  },
};
