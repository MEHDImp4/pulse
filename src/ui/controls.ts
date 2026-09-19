import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { env } from "../config/env";

export type MusicControlAction =
  | "pause"
  | "resume"
  | "skip"
  | "stop"
  | "voteskip"
  | "voldown"
  | "volup"
  | "seekback"
  | "seekforward";

const MUSIC_PREFIX = "mc:";
const QUEUE_PREFIX = "qp:";

const MUSIC_ACTIONS: readonly MusicControlAction[] = [
  "pause",
  "resume",
  "skip",
  "stop",
  "voteskip",
  "voldown",
  "volup",
  "seekback",
  "seekforward",
];

export function musicControlId(channelId: string, action: MusicControlAction): string {
  return `${MUSIC_PREFIX}${channelId}:${action}`;
}

export function parseMusicControl(
  customId: string,
): { channelId: string; action: MusicControlAction } | null {
  if (!customId.startsWith(MUSIC_PREFIX)) return null;
  const rest = customId.slice(MUSIC_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator <= 0 || separator === rest.length - 1) return null;

  const channelId = rest.slice(0, separator);
  const action = rest.slice(separator + 1) as MusicControlAction;
  if (!MUSIC_ACTIONS.includes(action)) return null;
  return { channelId, action };
}

export function queuePageId(channelId: string, page: number): string {
  return `${QUEUE_PREFIX}${channelId}:${page}`;
}

export function parseQueuePage(customId: string): { channelId: string; page: number } | null {
  if (!customId.startsWith(QUEUE_PREFIX)) return null;
  const rest = customId.slice(QUEUE_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator <= 0 || separator === rest.length - 1) return null;

  const channelId = rest.slice(0, separator);
  const page = Number.parseInt(rest.slice(separator + 1), 10);
  if (!Number.isInteger(page) || page < 0) return null;
  return { channelId, page };
}

/** Pause and resume are a single toggle button rendered from the current state. */
function playPauseButton(channelId: string, isPaused: boolean): ButtonBuilder {
  return isPaused
    ? new ButtonBuilder()
        .setCustomId(musicControlId(channelId, "resume"))
        .setEmoji("▶️")
        .setLabel("Reprendre")
        .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
        .setCustomId(musicControlId(channelId, "pause"))
        .setEmoji("⏸️")
        .setLabel("Pause")
        .setStyle(ButtonStyle.Secondary);
}

export function musicControlsRow(channelId: string, isPaused = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    playPauseButton(channelId, isPaused),
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "skip"))
      .setEmoji("⏭️")
      .setLabel("Suivant")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "stop"))
      .setEmoji("⏹️")
      .setLabel("Arrêter")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "voldown"))
      .setEmoji("🔉")
      .setLabel(`-${env.volumeStep}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "volup"))
      .setEmoji("🔊")
      .setLabel(`+${env.volumeStep}`)
      .setStyle(ButtonStyle.Secondary),
  );
}

export function audioControlsRow(channelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "voteskip"))
      .setEmoji("🗳️")
      .setLabel("Vote")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "seekback"))
      .setEmoji("⏪")
      .setLabel(`-${env.seekStepSeconds}s`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(musicControlId(channelId, "seekforward"))
      .setEmoji("⏩")
      .setLabel(`+${env.seekStepSeconds}s`)
      .setStyle(ButtonStyle.Secondary),
  );
}

export function playbackControlsRows(channelId: string, isPaused = false): ActionRowBuilder<ButtonBuilder>[] {
  return [musicControlsRow(channelId, isPaused), audioControlsRow(channelId)];
}

export function queueControlsRow(
  channelId: string,
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  const lastPage = Math.max(0, totalPages - 1);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(queuePageId(channelId, Math.max(0, page - 1)))
      .setEmoji("◀️")
      .setLabel("Précédent")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(queuePageId(channelId, Math.min(lastPage, page + 1)))
      .setEmoji("▶️")
      .setLabel("Suivant")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= lastPage),
  );
}
