import { SlashCommandBuilder } from "discord.js";
import { replyTemporary } from "../utils/reply";
import { queueControlsRow, queueSelectRow } from "../ui/controls";
import { queueEmbed, queuePageCount } from "../ui/embeds";
import { resolveReadPlayer } from "./helpers";
import type { CommandDefinition } from "./types";

export const queue: CommandDefinition = {
  data: new SlashCommandBuilder().setName("queue").setDescription("Affiche la file d'attente"),
  usage: "/queue",
  async execute(interaction, { players }) {
    const result = await resolveReadPlayer(interaction, players);
    if (result.status !== "ok") {
      await replyTemporary(
        interaction,
        result.status === "notGuild"
          ? "❌ Cette commande doit être utilisée dans un serveur."
          : "🎶 La file d'attente est vide.",
      );
      return;
    }
    const player = result.player;
    const totalPages = queuePageCount(player);
    await interaction.reply({
      embeds: [queueEmbed(player, 0)],
      components: [
        ...(totalPages > 1 ? [queueControlsRow(player.channelId, 0, totalPages)] : []),
        ...(player.queue.size ? [queueSelectRow(player.channelId, player.queue.snapshot(), 0)] : []),
      ],
    });
  },
};
