import {
  GuildMember,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { PlayerManager } from "../music/PlayerManager";
import { djRoleStore, memberRoleIds } from "../music/DjRoleStore";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import {
  parseQueueSelect, parseQueueAction, queueActionRow, queueTrackFingerprint,
} from "../ui/controls";

/** Public queue selector opens a private panel; no modification yet. */
export async function handleQueueSelection(
  interaction: StringSelectMenuInteraction,
  players: PlayerManager,
): Promise<boolean> {
  const channelId = parseQueueSelect(interaction.customId);
  if (!channelId) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guildId) {
    await interaction.editReply("❌ Cette sélection doit être utilisée dans un serveur.");
    return true;
  }
  const player = players.get(interaction.guildId, channelId);
  if (!player?.isConnected) {
    await interaction.editReply("❌ Ce lecteur n'est plus connecté.");
    return true;
  }
  const selected = /^(\d{1,3}):([a-f0-9]{12})$/.exec(interaction.values[0] ?? "");
  if (!selected) {
    await interaction.editReply("❌ Sélection invalide.");
    return true;
  }
  const position = Number(selected[1]);
  const track = player.queue.snapshot()[position];
  if (!track || selected[2] !== queueTrackFingerprint(track)) {
    await interaction.editReply("ℹ️ La file a changé. Relance /queue pour sélectionner le morceau actuel.");
    return true;
  }
  await interaction.editReply({
    content: `Musique **#${position + 1} — ${track.title.slice(0, 120)}**\n` +
      "Les actions sont réservées aux DJ présents dans le salon vocal.",
    components: [queueActionRow(channelId, position, selected[2], player.queue.size)],
  });
  return true;
}

/** Validate each selected track against the current queue before any mutation. */
export async function handleQueueAction(
  interaction: ButtonInteraction,
  players: PlayerManager,
): Promise<boolean> {
  const parsed = parseQueueAction(interaction.customId);
  if (!parsed) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!interaction.guildId || !interaction.guild) {
    await interaction.editReply("❌ Cette action doit être utilisée dans un serveur.");
    return true;
  }
  const player = players.get(interaction.guildId, parsed.channelId);
  if (!player?.isConnected) {
    await interaction.editReply("❌ Le lecteur n'est plus connecté.");
    return true;
  }
  const member = interaction.member instanceof GuildMember
    ? interaction.member
    : await interaction.guild.members.fetch(interaction.user.id);
  if (member.voice.channelId !== parsed.channelId) {
    await interaction.editReply("❌ Rejoins le salon vocal du bot.");
    return true;
  }
  if (!canUseDjControls(
    interaction.memberPermissions, memberRoleIds(interaction.member),
    djRoleStore.getRoles(interaction.guildId),
  )) {
    await interaction.editReply(DJ_ONLY_MESSAGE);
    return true;
  }
  const song = player.queue.snapshot()[parsed.position];
  if (!song || queueTrackFingerprint(song) !== parsed.fingerprint) {
    await interaction.editReply("ℹ️ Ce morceau a changé de position. Utilise /queue pour actualiser.");
    return true;
  }
  if (player.partyMode && parsed.action !== "remove") {
    await interaction.editReply("ℹ️ En mode soirée, l'ordre est géré automatiquement. Désactive /party pour déplacer les titres.");
    return true;
  }

  let done = false;
  switch (parsed.action) {
    case "up": done = player.queue.move(parsed.position, parsed.position - 1); break;
    case "down": done = player.queue.move(parsed.position, parsed.position + 1); break;
    case "remove": done = player.queue.removeAt(parsed.position) !== undefined; break;
  }
  if (done) player.notifyQueueChange();
  await interaction.editReply({
    content: done ? `✅ File mise à jour : **${song.title.slice(0, 120)}**.` : "❌ Position indisponible.",
  });
  return true;
}
