import { SlashCommandBuilder } from "discord.js";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const stop: CommandDefinition = {
  data: new SlashCommandBuilder().setName("stop").setDescription("Arrête la musique et vide la queue"),
  usage: "/stop",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    if (!canUseDjControls(interaction.memberPermissions)) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }

    await context.player.stop();
    await replyTemporary(interaction, "⏹ Lecture arrêtée et file d'attente vidée.");
  },
};
