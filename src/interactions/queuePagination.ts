import { MessageFlags, type ButtonInteraction } from "discord.js";
import type { PlayerManager } from "../music/PlayerManager";
import { parseQueuePage, queueControlsRow, queueSelectRow } from "../ui/controls";
import { queueEmbed, queuePageCount } from "../ui/embeds";

export async function handleQueuePagination(
  interaction: ButtonInteraction,
  players: PlayerManager,
): Promise<boolean> {
  const parsed = parseQueuePage(interaction.customId);
  if (!parsed) return false;

  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Ce bouton doit être utilisé dans un serveur.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const player = players.get(interaction.guildId, parsed.channelId);
  if (!player) {
    await interaction.update({ content: "🎶 La file d'attente est vide.", embeds: [], components: [] });
    return true;
  }

  const totalPages = queuePageCount(player);
  const page = Math.max(0, Math.min(parsed.page, totalPages - 1));

  await interaction.update({
    embeds: [queueEmbed(player, page)],
    components: [
      ...(totalPages > 1 ? [queueControlsRow(player.channelId, page, totalPages)] : []),
      ...(player.queue.size ? [queueSelectRow(player.channelId, player.queue.snapshot(), page)] : []),
    ],
  });
  return true;
}
