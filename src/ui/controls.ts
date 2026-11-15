import { createHash } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import type { Track } from "../music/Track";
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


const QUEUE_SELECT_PREFIX = "qs:";
const QUEUE_ACTION_PREFIX = "qa:";
export type QueueAction = "up" | "down" | "remove";

/** Stable short fingerprint for a selected queue occurrence. */
export function queueTrackFingerprint(track: Track): string {
  return createHash("sha256")
    .update(track.provider).update("\0")
    .update(track.webpageUrl).update("\0")
    .update(track.requestedBy.id)
    .digest("hex").slice(0, 12);
}

export function queueSelectId(channelId: string): string {
  return QUEUE_SELECT_PREFIX + channelId;
}

export function parseQueueSelect(customId: string): string | undefined {
  if (!customId.startsWith(QUEUE_SELECT_PREFIX)) return undefined;
  const channelId = customId.slice(QUEUE_SELECT_PREFIX.length);
  return channelId.length > 0 && channelId.length <= 30 ? channelId : undefined;
}

export function queueActionId(channelId: string, action: QueueAction, position: number, fingerprint: string): string {
  return `${QUEUE_ACTION_PREFIX}${channelId}:${action}:${position}:${fingerprint}`;
}

export function parseQueueAction(customId: string): {
  channelId: string;
  action: QueueAction;
  position: number;
  fingerprint: string;
} | undefined {
  if (!customId.startsWith(QUEUE_ACTION_PREFIX)) return undefined;
  const match = /^qa:([^:]{1,30}):(up|down|remove):(\d{1,3}):([a-f0-9]{12})$/.exec(customId);
  if (!match) return undefined;
  return {
    channelId: match[1],
    action: match[2] as QueueAction,
    position: Number(match[3]),
    fingerprint: match[4],
  };
}

export function queueSelectRow(
  channelId: string,
  tracks: readonly Track[],
  page: number,
  perPage = 10,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const first = Math.max(0, Math.floor(page)) * perPage;
  const selection = tracks.slice(first, first + perPage);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(queueSelectId(channelId))
    .setPlaceholder("Choisir une musique à gérer")
    .addOptions(selection.map((track, index) => ({
      label: `${first + index + 1}. ${track.title}`.slice(0, 100),
      value: `${first + index}:${queueTrackFingerprint(track)}`,
      description: (track.author ?? track.requestedBy.username).slice(0, 100),
    })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function queueActionRow(
  channelId: string,
  position: number,
  fingerprint: string,
  queueSize: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(queueActionId(channelId, "up", position, fingerprint))
      .setLabel("Monter").setEmoji("⬆️").setStyle(ButtonStyle.Secondary).setDisabled(position <= 0),
    new ButtonBuilder().setCustomId(queueActionId(channelId, "down", position, fingerprint))
      .setLabel("Descendre").setEmoji("⬇️").setStyle(ButtonStyle.Secondary).setDisabled(position >= queueSize - 1),
    new ButtonBuilder().setCustomId(queueActionId(channelId, "remove", position, fingerprint))
      .setLabel("Retirer").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );
}
