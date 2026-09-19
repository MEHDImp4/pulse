import { SlashCommandBuilder } from "discord.js";
import { refreshNowPlaying } from "../services/nowPlaying";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const resume: CommandDefinition = {
  data: new SlashCommandBuilder().setName("resume").setDescription("Reprend la lecture"),
  usage: "/resume",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;
    const changed = await context.player.resume();
    if (changed) await refreshNowPlaying(context.player);
    await replyTemporary(interaction, changed ? "▶️ Lecture reprise." : "ℹ️ La lecture n'est pas en pause.");
  },
};
