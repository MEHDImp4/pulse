import { SlashCommandBuilder } from "discord.js";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const forceskip: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("forceskip")
    .setDescription("Force le passage au morceau suivant (modérateurs)"),
  cooldownSeconds: 3,
  usage: "/forceskip",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    if (!canUseDjControls(interaction.memberPermissions)) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }

    const skipped = await context.player.skip();
    await replyTemporary(interaction, skipped ? "⏭ Morceau passé de force." : "ℹ️ Aucun morceau à ignorer.");
  },
};
