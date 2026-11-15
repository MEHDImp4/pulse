import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { FILTER_LABELS } from "../audio/filters";
import type { GuildPlayer } from "../music/GuildPlayer";
import type { PlayerManager } from "../music/PlayerManager";
import { formatDuration } from "../utils/time";
import type { CommandDefinition } from "./types";

const MAX_SESSIONS = 10;
const MAX_TITLE = 40;
const MAX_DESCRIPTION = 4_096;

/**
 * Only expose sessions from the invoking guild. A public /status response must
 * never disclose another server's channel IDs, current songs or diagnostics.
 */
export function visibleStatusSessions<T extends { isConnected: boolean }>(
  players: { getForGuild(guildId: string): T[] },
  guildId: string | null,
): T[] {
  if (!guildId) return [];
  return players.getForGuild(guildId).filter((player) => player.isConnected);
}

function formatPing(value: number | undefined): string {
  return value === undefined || value < 0 ? "—" : `${value} ms`;
}

function truncateTitle(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

export const status: CommandDefinition = {
  data: new SlashCommandBuilder().setName("status").setDescription("Affiche l'état du bot sur ce serveur"),
  usage: "/status",
  async execute(interaction, { players }) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Cette commande doit être utilisée dans un serveur.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const active: GuildPlayer[] = visibleStatusSessions(players as PlayerManager, interaction.guildId);
    const embed = new EmbedBuilder()
      .setTitle("📊 État de Pulse — ce serveur")
      .addFields(
        { name: "Sessions vocales", value: String(active.length), inline: true },
        { name: "Latence Discord", value: formatPing(interaction.client.ws.ping), inline: true },
      );

    const cache = players.cacheForGuild(interaction.guildId);
    if (cache) {
      embed.addFields({
        name: "Préchargement de la file",
        value: `${cache.ready}/${cache.queued} prêtes · ${cache.downloading} en téléchargement · ${cache.pending} en attente · ${cache.failed} indisponibles`,
      });
    }

    if (active.length === 0) {
      embed.setDescription("ℹ️ Aucune lecture en cours sur ce serveur.");
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const lines = active.slice(0, MAX_SESSIONS).map((player) => {
      const track = player.currentTrack?.title ?? "—";
      const ping = player.voicePing;
      const diagnostic = player.diagnostics.snapshot();
      const avg = diagnostic.transitions ? `${diagnostic.avgTransitionMs} ms` : "—";
      const p95 = diagnostic.transitions ? `${diagnostic.p95TransitionMs} ms` : "—";
      return [
        `<#${player.channelId}> — **${player.state}**`,
        `> ${truncateTitle(track)}`,
        `> file ${player.queueSize} · 🔊 ${player.volume}% · 🎛️ ${FILTER_LABELS[player.filter]} · ♾️ ${player.autoplay ? "on" : "off"}`,
        `> audio norm ${player.quality.normalize ? "on" : "off"} · intro ${player.quality.trimStartSilence ? "coupée" : "intacte"} · fondu ${player.quality.fadeSeconds}s · crossfade ${player.quality.crossfadeSeconds}s`,
        `> ping ws ${formatPing(ping?.ws)} / udp ${formatPing(ping?.udp)}`,
        `> transitions ${diagnostic.transitions} · moyenne ${avg} · p95 ${p95}`,
        `> cache ${diagnostic.cacheHits} · streaming ${diagnostic.cacheMisses} · standby ${diagnostic.preloadHits}`,
        `> récupérations ${diagnostic.stallRecoveries} · sauts sur blocage ${diagnostic.stallSkips} · échecs ${diagnostic.startFailures + diagnostic.playerErrors}`,
      ].join("\n");
    });
    if (active.length > MAX_SESSIONS) {
      lines.push(`… et ${active.length - MAX_SESSIONS} autre(s) session(s).`);
    }
    let description = lines.join("\n\n");
    if (description.length > MAX_DESCRIPTION) description = `${description.slice(0, MAX_DESCRIPTION - 1)}…`;
    embed.setDescription(description);
    await interaction.reply({ embeds: [embed] });
  },
};
