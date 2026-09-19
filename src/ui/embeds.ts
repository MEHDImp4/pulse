import { EmbedBuilder } from "discord.js";
import { FILTER_LABELS } from "../audio/filters";
import { formatVolume } from "../audio/volume";
import type { GuildPlayer } from "../music/GuildPlayer";
import type { Track } from "../music/Track";
import { formatDuration } from "../utils/time";
import { renderProgressBar } from "./progress";
import { COLORS, LOOP_LABELS, STATE_LABELS, stateColor } from "./theme";

export const QUEUE_PAGE_SIZE = 10;

const MAX_TITLE = 256;
const MAX_FIELD_VALUE = 1_024;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Discord.js throws on invalid embed URLs, so only forward well-formed links. */
function safeRemoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function applyTrackLinks(embed: EmbedBuilder, track: Track): void {
  const url = safeRemoteUrl(track.webpageUrl);
  if (url) embed.setURL(url);
  const thumbnail = safeRemoteUrl(track.thumbnail);
  if (thumbnail) embed.setThumbnail(thumbnail);
}

function trackLines(track: Track): string {
  const duration = track.duration !== undefined ? ` · ${formatDuration(track.duration)}` : "";
  const author = track.author ? ` — ${track.author}` : "";
  return `**${track.title}**${author}${duration}`;
}

/** Live now-playing card, used by /play (on start) and /nowplaying. */
export function nowPlayingEmbed(player: GuildPlayer): EmbedBuilder {
  const track = player.currentTrack;
  const state = player.state;

  if (!track) {
    return new EmbedBuilder().setColor(COLORS.muted).setDescription("Aucun morceau en cours.");
  }

  const elapsed = player.playbackElapsedMs ?? 0;
  const description = [
    track.author,
    `\`${renderProgressBar(elapsed, track.duration)}\``,
  ]
    .filter(Boolean)
    .join("\n");

  const fields = [
    { name: "Demandé par", value: track.requestedBy.username, inline: true },
    { name: "Volume", value: formatVolume(player.volume), inline: true },
  ];
  if (player.filter !== "off") {
    fields.push({ name: "Filtre", value: FILTER_LABELS[player.filter], inline: true });
  }

  const footer = [STATE_LABELS[state], `File ${player.queueSize}`, `Boucle ${LOOP_LABELS[player.loopMode]}`];
  if (player.autoplay) footer.push("Autoplay");
  if (track.isLive) footer.push("Direct");

  const embed = new EmbedBuilder()
    .setColor(stateColor(state))
    .setAuthor({ name: "Pulse" })
    .setTitle(truncate(track.title, MAX_TITLE))
    .setDescription(description)
    .addFields(...fields)
    .setFooter({ text: footer.join(" · ") });

  applyTrackLinks(embed, track);
  return embed;
}

export interface QueuedEmbedOptions {
  /** Queue position, when the track was appended. */
  position?: number;
  /** True for /playnext: the track plays right after the current one. */
  pending?: boolean;
}

/** Compact confirmation for a track added to the queue. */
export function queuedEmbed(track: Track, options: QueuedEmbedOptions = {}): EmbedBuilder {
  const fields = [
    { name: "Durée", value: formatDuration(track.duration), inline: true },
    { name: "Demandé par", value: track.requestedBy.username, inline: true },
  ];
  if (options.position !== undefined) {
    fields.unshift({ name: "Position", value: `#${options.position}`, inline: true });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.muted)
    .setTitle(options.pending ? "Sera joué juste après" : "Ajouté à la file")
    .setDescription(trackLines(track))
    .addFields(...fields);

  applyTrackLinks(embed, track);
  return embed;
}

export interface PlaylistImportSummary {
  title?: string;
  added: number;
  limit: number;
  partial: boolean;
  limitReached: boolean;
}

export function playlistImportedEmbed(summary: PlaylistImportSummary): EmbedBuilder {
  const name = summary.title ? `**${summary.title}**` : "Playlist";
  const lines = [`${name} — ${summary.added} morceau(x) ajouté(s).`];
  if (summary.limitReached) lines.push(`Limite atteinte (${summary.limit}).`);
  if (summary.partial) lines.push("Certains morceaux n'ont pas pu être ajoutés.");

  return new EmbedBuilder()
    .setColor(COLORS.muted)
    .setTitle("Playlist importée")
    .setDescription(lines.join("\n"));
}

export function queuePageCount(player: GuildPlayer): number {
  return Math.max(1, Math.ceil(player.queue.size / QUEUE_PAGE_SIZE));
}

export function queueEmbed(player: GuildPlayer, page = 0): EmbedBuilder {
  const upcoming = player.queue.snapshot();
  const current = player.currentTrack;
  const totalPages = queuePageCount(player);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const start = safePage * QUEUE_PAGE_SIZE;
  const pageTracks = upcoming.slice(start, start + QUEUE_PAGE_SIZE);

  const lines = pageTracks.map((track, index) => {
    const duration = track.duration !== undefined ? ` · ${formatDuration(track.duration)}` : "";
    const author = track.author ? ` — ${track.author}` : "";
    return `${start + index + 1}. **${track.title}**${author}${duration}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.muted)
    .setTitle("File d'attente")
    .addFields(
      {
        name: "En cours",
        value: truncate(current ? trackLines(current) : "Aucun morceau", MAX_FIELD_VALUE),
      },
      {
        name: `À suivre (${upcoming.length})`,
        value: truncate(lines.length ? lines.join("\n") : "La file est vide.", MAX_FIELD_VALUE),
      },
    );

  const totalKnown = upcoming.reduce((sum, track) => sum + (track.duration ?? 0), 0);
  const footer = [`Page ${safePage + 1}/${totalPages}`];
  if (totalKnown > 0) footer.push(`~${formatDuration(totalKnown)}`);
  return embed.setFooter({ text: footer.join(" · ") });
}
