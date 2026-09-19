import { SlashCommandBuilder } from "discord.js";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const shuffle: CommandDefinition = {
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Mélange la file d'attente"),
  usage: "/shuffle",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    if (!canUseDjControls(interaction.memberPermissions)) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }

    const count = context.player.queue.size;
    if (count < 2) {
      await replyTemporary(interaction, "ℹ️ Pas assez de morceaux pour mélanger.");
      return;
    }

    context.player.queue.shuffle();
    context.player.notifyQueueChange();
    await replyTemporary(interaction, `🔀 File mélangée (${count} morceaux).`);
  },
};
