import { SlashCommandBuilder } from "discord.js";
import { djRoleStore, memberRoleIds } from "../music/DjRoleStore";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const fairqueue: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("fairqueue").setDescription("Alterne les morceaux de chaque personne dans la file"),
  usage: "/fairqueue",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;
    if (!canUseDjControls(interaction.memberPermissions, memberRoleIds(interaction.member), djRoleStore.getRoles(interaction.guildId))) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }
    const count = context.player.queue.size;
    if (count < 2) {
      await replyTemporary(interaction, "ℹ️ Pas assez de morceaux.");
      return;
    }
    context.player.queue.fairQueue();
    context.player.notifyQueueChange();
    await replyTemporary(interaction, `⚖️ File équilibrée entre les utilisateurs (${count} morceaux).`);
  },
};
