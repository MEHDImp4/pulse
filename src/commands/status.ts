import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { FILTER_LABELS } from "../audio/filters";
import { getExternalToolStatus } from "../utils/externalTools";
import { formatDuration } from "../utils/time";
import type { CommandDefinition } from "./types";

const MAX_SESSIONS = 10;
const MAX_TITLE = 40;
const MAX_DESCRIPTION = 4_096;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function formatPing(value: number | undefined): string {
  return value === undefined || value < 0 ? "—" : `${value} ms`;
}

function truncateTitle(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}

export const status: CommandDefinition = {
  data: new SlashCommandBuilder().setName("status").setDescription("Affiche l'état du bot"),
  usage: "/status",
  async execute(interaction, { players }) {
    const active = players.activePlayers();
    const memory = process.memoryUsage();
    const tools = getExternalToolStatus();
    const toolsValue =
      tools.length === 0
        ? "— (sonde au démarrage)"
        : tools.map((tool) => `${tool.name} ${tool.ok ? "✅" : "❌"}`).join(" · ");
    const liveProcesses = active.reduce((sum, player) => sum + player.childProcessCount, 0);

    const embed = new EmbedBuilder()
      .setTitle("📊 État de Pulse")
      .addFields(
        { name: "Uptime", value: formatDuration(Math.floor(process.uptime())), inline: true },
        { name: "Serveurs", value: String(interaction.client.guilds.cache.size), inline: true },
        { name: "Sessions", value: `${active.length} actives / ${players.size}`, inline: true },
        { name: "Mémoire", value: `${formatBytes(memory.rss)} RSS`, inline: true },
        { name: "Node", value: process.version, inline: true },
        { name: "Gateway", value: formatPing(interaction.client.ws.ping), inline: true },
        { name: "Outils", value: toolsValue, inline: true },
        { name: "Processus", value: String(liveProcesses), inline: true },
      );

    if (active.length === 0) {
      embed.setDescription("ℹ️ Aucune lecture en cours.");
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const lines = active.slice(0, MAX_SESSIONS).map((player) => {
      const track = player.currentTrack?.title ?? "—";
      const ping = player.voicePing;
      return [
        `<#${player.channelId}> — **${player.state}**`,
        `> ${truncateTitle(track)}`,
        `> file ${player.queueSize} · 🔊 ${player.volume}% · 🎛️ ${FILTER_LABELS[player.filter]} · ♾️ ${player.autoplay ? "on" : "off"}`,
        `> ping ws ${formatPing(ping?.ws)} / udp ${formatPing(ping?.udp)} · proc ${player.childProcessCount}`,
      ].join("\n");
    });

    if (active.length > MAX_SESSIONS) {
      lines.push(`… et ${active.length - MAX_SESSIONS} autre(s) session(s).`);
    }

    let description = lines.join("\n\n");
    if (description.length > MAX_DESCRIPTION) {
      description = `${description.slice(0, MAX_DESCRIPTION - 1)}…`;
    }
    embed.setDescription(description);
    await interaction.reply({ embeds: [embed] });
  },
};
