import {
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type VoiceBasedChannel,
} from "discord.js";
import type { GuildPlayer } from "../music/GuildPlayer";
import type { PlayerManager } from "../music/PlayerManager";

export async function memberVoiceChannel(
  interaction: ChatInputCommandInteraction,
): Promise<VoiceBasedChannel | null> {
  if (!interaction.guild) return null;
  // `interaction.member` comes from the interaction payload and is served from
  // cache: no REST round-trip, so commands stay well inside Discord's 3s ACK
  // window (a cold `members.fetch` used to expire the interaction). Only fall
  // back to an API fetch when the member is not a cached GuildMember instance.
  const member = interaction.member;
  if (member instanceof GuildMember) return member.voice.channel;

  const fetched = await interaction.guild.members.fetch(interaction.user.id);
  return fetched.voice.channel;
}

export interface ControlContext {
  player: GuildPlayer;
  channel: VoiceBasedChannel;
}

/**
 * Resolves the player attached to the caller's voice channel. Commands that
 * mutate playback require the caller to share the bot's channel.
 */
export async function requireControlChannel(
  interaction: ChatInputCommandInteraction,
  players: PlayerManager,
): Promise<ControlContext | null> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Cette commande doit être utilisée dans un serveur.", flags: MessageFlags.Ephemeral });
    return null;
  }

  const channel = await memberVoiceChannel(interaction);
  if (!channel) {
    await interaction.reply({ content: "❌ Rejoins d'abord un salon vocal.", flags: MessageFlags.Ephemeral });
    return null;
  }

  const player = players.get(interaction.guildId, channel.id);
  if (!player || !player.isConnected) {
    await interaction.reply({ content: "❌ Le bot n'est pas connecté à ton salon vocal.", flags: MessageFlags.Ephemeral });
    return null;
  }

  if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
  return { player, channel };
}

export type PlaybackPrep =
  | { status: "ok"; channel: VoiceBasedChannel }
  | { status: "error"; message: string };

/**
 * Validates that a playback command may open a voice session: the caller must
 * be in a voice channel the bot can join, and no session may already be active
 * in another channel of the same guild (Discord allows one voice channel per
 * guild per bot, so a second join would hijack the existing connection).
 *
 * Never replies: callers run this after deferring and render the single
 * response themselves, which keeps every path free of interaction races.
 */
export async function preparePlayback(
  interaction: ChatInputCommandInteraction,
  players: PlayerManager,
): Promise<PlaybackPrep> {
  if (!interaction.guildId || !interaction.guild) {
    return { status: "error", message: "❌ Cette commande doit être utilisée dans un serveur." };
  }

  const channel = await memberVoiceChannel(interaction);
  if (!channel) {
    return { status: "error", message: "❌ Tu dois être dans un salon vocal pour utiliser cette commande." };
  }

  if (!canJoinAndSpeak(channel, interaction)) {
    return { status: "error", message: "❌ Je n'ai pas la permission de rejoindre ou parler dans ce salon." };
  }

  const conflict = players.findGuildConflict(interaction.guildId, channel.id);
  if (conflict) {
    return {
      status: "error",
      message: `❌ Je suis déjà connecté dans <#${conflict.channelId}> sur ce serveur. Utilise \`/leave\` là-bas avant de lancer une autre session.`,
    };
  }

  return { status: "ok", channel };
}

export type ReadPlayerResult =
  | { status: "ok"; player: GuildPlayer }
  | { status: "notGuild" }
  | { status: "none" };

/**
 * Resolves a player for read-only commands: the caller's channel first, then
 * the only active session of the guild. Never replies itself so callers can
 * send exactly one response.
 */
export async function resolveReadPlayer(
  interaction: ChatInputCommandInteraction,
  players: PlayerManager,
): Promise<ReadPlayerResult> {
  if (!interaction.guildId) return { status: "notGuild" };

  const channel = await memberVoiceChannel(interaction);
  if (channel) {
    const player = players.get(interaction.guildId, channel.id);
    if (player?.isConnected) {
      if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
      return { status: "ok", player };
    }
  }

  const guildPlayers = players.getForGuild(interaction.guildId).filter((player) => player.isConnected);
  if (guildPlayers.length === 1) {
    const player = guildPlayers[0];
    if (interaction.channelId) player.lastTextChannelId = interaction.channelId;
    return { status: "ok", player };
  }

  return { status: "none" };
}

export function canJoinAndSpeak(channel: VoiceBasedChannel, interaction: ChatInputCommandInteraction): boolean {
  const permissions = channel.permissionsFor(interaction.guild!.members.me!);
  return Boolean(
    permissions?.has(PermissionFlagsBits.Connect) && permissions.has(PermissionFlagsBits.Speak),
  );
}
