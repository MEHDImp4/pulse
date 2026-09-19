import { SlashCommandBuilder } from "discord.js";
import { refreshNowPlaying } from "../services/nowPlaying";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const pause: CommandDefinition = {
  data: new SlashCommandBuilder().setName("pause").setDescription("Met la lecture en pause"),
  usage: "/pause",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;
    const changed = await context.player.pause();
    if (changed) await refreshNowPlaying(context.player);
    await replyTemporary(interaction, changed ? "⏸ Lecture mise en pause." : "ℹ️ La lecture n'est pas en cours.");
  },
};
