import {
  GuildMember,
  MessageFlags,
  type ButtonInteraction,
  type VoiceBasedChannel,
} from "discord.js";
import { env } from "../config/env";
import type { GuildPlayer } from "../music/GuildPlayer";
import type { PlayerManager } from "../music/PlayerManager";
import { computeSkipThreshold } from "../music/voteSkip";
import { refreshNowPlaying } from "../services/nowPlaying";
import { parseMusicControl } from "../ui/controls";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { formatDuration } from "../utils/time";

async function replyPrivate(interaction: ButtonInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });

  // Auto-delete transient confirmations, but keep errors readable.
  if (content.startsWith("❌")) return;
  if (env.autoDeleteSeconds <= 0) return;
  setTimeout(() => {
    void interaction.deleteReply().catch(() => undefined);
  }, env.autoDeleteSeconds * 1000);
}

function botVoiceChannel(interaction: ButtonInteraction, channelId: string): VoiceBasedChannel | null {
  if (!interaction.guild) return null;
  const channel = interaction.guild.channels.cache.get(channelId);
  return channel?.isVoiceBased() ? channel : null;
}

/** Casts a skip vote: used by the vote button and by non-DJ members pressing "Suivant". */
async function castSkipVote(
  interaction: ButtonInteraction,
  player: GuildPlayer,
  channelId: string,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  let voiceChannel = botVoiceChannel(interaction, channelId);
  if (!voiceChannel) {
    const fetched = await guild.channels.fetch(channelId).catch(() => null);
    if (fetched?.isVoiceBased()) voiceChannel = fetched;
  }
  if (!voiceChannel) {
    await replyPrivate(interaction, "❌ Salon vocal introuvable pour compter les votes.");
    return;
  }

  const humans = voiceChannel.members.filter((member) => !member.user.bot).size;
  const threshold = computeSkipThreshold(humans, env.voteSkipMin, env.voteSkipRatio);
  const result = await player.voteSkip(interaction.user.id, threshold);
  await replyPrivate(
    interaction,
    result.skipped ? "⏭ Assez de votes — morceau ignoré." : `🗳️ Vote enregistré (${result.votes}/${threshold}).`,
  );
}

export async function handleMusicControl(
  interaction: ButtonInteraction,
  players: PlayerManager,
): Promise<boolean> {
  const parsed = parseMusicControl(interaction.customId);
  if (!parsed) return false;

  if (!interaction.guildId || !interaction.guild) {
    await replyPrivate(interaction, "❌ Ce bouton doit être utilisé dans un serveur.");
    return true;
  }

  const player = players.get(interaction.guildId, parsed.channelId);
  if (!player || !player.isConnected) {
    await replyPrivate(interaction, "❌ Le bot n'est plus connecté à un salon vocal.");
    return true;
  }

  // Use the cached member from the interaction payload; a REST fetch here can
  // exceed Discord's 3s ACK window and surface "Unknown interaction".
  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
  const channel = member.voice.channel;

  if (!channel) {
    await replyPrivate(interaction, "❌ Rejoins d'abord le salon vocal du bot.");
    return true;
  }

  if (channel.id !== parsed.channelId) {
    await replyPrivate(interaction, "❌ Tu dois être dans le même salon vocal que le bot.");
    return true;
  }

  const isDj = canUseDjControls(interaction.memberPermissions);
  const { action } = parsed;

  switch (action) {
    case "pause": {
      const changed = await player.pause();
      if (changed) await refreshNowPlaying(player);
      await replyPrivate(interaction, changed ? "⏸ Lecture mise en pause." : "ℹ️ La lecture n'est pas en cours.");
      return true;
    }

    case "resume": {
      const changed = await player.resume();
      if (changed) await refreshNowPlaying(player);
      await replyPrivate(interaction, changed ? "▶️ Lecture reprise." : "ℹ️ La lecture n'est pas en pause.");
      return true;
    }

    case "skip": {
      if (!isDj) {
        await castSkipVote(interaction, player, parsed.channelId);
        return true;
      }
      const skipped = await player.skip();
      await replyPrivate(interaction, skipped ? "⏭ Morceau ignoré." : "ℹ️ Aucun morceau à ignorer.");
      return true;
    }

    case "stop":
      if (!isDj) {
        await replyPrivate(interaction, DJ_ONLY_MESSAGE);
        return true;
      }
      await player.stop();
      await replyPrivate(interaction, "⏹ Lecture arrêtée et file d'attente vidée.");
      return true;

    case "voteskip":
      await castSkipVote(interaction, player, parsed.channelId);
      return true;

    case "voldown":
    case "volup": {
      const delta = action === "volup" ? env.volumeStep : -env.volumeStep;
      player.volume = player.volume + delta;
      await refreshNowPlaying(player);
      await replyPrivate(interaction, `🔊 Volume : **${player.volume}%**`);
      return true;
    }

    case "seekback":
    case "seekforward": {
      if (!isDj) {
        await replyPrivate(interaction, DJ_ONLY_MESSAGE);
        return true;
      }
      const elapsed = Math.floor((player.playbackElapsedMs ?? 0) / 1000);
      const delta = action === "seekforward" ? env.seekStepSeconds : -env.seekStepSeconds;
      const target = Math.max(0, elapsed + delta);
      const moved = await player.seek(target);
      if (!moved) {
        await replyPrivate(interaction, "ℹ️ Aucun morceau à déplacer.");
        return true;
      }
      await refreshNowPlaying(player);
      await replyPrivate(interaction, `⏩ Position : **${formatDuration(target)}**`);
      return true;
    }

    default:
      return false;
  }
}
