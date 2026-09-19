import { SlashCommandBuilder } from "discord.js";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const clear: CommandDefinition = {
  data: new SlashCommandBuilder().setName("clear").setDescription("Vide la file d'attente"),
  usage: "/clear",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    if (!canUseDjControls(interaction.memberPermissions)) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }

    const count = context.player.queue.size;
    context.player.queue.clear();
    context.player.notifyQueueChange();
    await replyTemporary(
      interaction,
      count > 0 ? `🗑️ File vidée (${count} morceaux retirés).` : "ℹ️ La file était déjà vide.",
    );
  },
};
