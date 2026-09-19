import { SlashCommandBuilder } from "discord.js";
import { refreshNowPlaying } from "../services/nowPlaying";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { formatDuration, parseTimecode } from "../utils/time";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const seek: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Déplace la lecture à une position (secondes ou mm:ss)")
    .addStringOption((option) =>
      option
        .setName("position")
        .setDescription("Position cible (ex : 90, 1:30, 1:02:03)")
        .setRequired(true),
    ),
  cooldownSeconds: 3,
  usage: "/seek position:<secondes|mm:ss>",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    if (!canUseDjControls(interaction.memberPermissions)) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }

    if (!context.player.currentTrack) {
      await replyTemporary(interaction, "ℹ️ Aucun morceau en cours.");
      return;
    }

    const raw = interaction.options.getString("position", true);
    const seconds = parseTimecode(raw);
    if (seconds === undefined) {
      await replyTemporary(interaction, "❌ Position invalide. Essaie `90`, `1:30` ou `1:02:03`.");
      return;
    }

    const moved = await context.player.seek(seconds);
    if (!moved) {
      await replyTemporary(interaction, "ℹ️ Impossible de déplacer la lecture.");
      return;
    }

    await refreshNowPlaying(context.player);
    await replyTemporary(interaction, `⏩ Lecture déplacée à **${formatDuration(seconds)}**.`);
  },
};
