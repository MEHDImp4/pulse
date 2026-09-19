import { SlashCommandBuilder } from "discord.js";
import { env } from "../config/env";
import { computeSkipThreshold } from "../music/voteSkip";
import { canUseDjControls } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const skip: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Passe au morceau suivant (vote pour les non-modérateurs)"),
  usage: "/skip",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    if (canUseDjControls(interaction.memberPermissions)) {
      const skipped = await context.player.skip();
      await replyTemporary(interaction, skipped ? "⏭ Morceau ignoré." : "ℹ️ Aucun morceau à ignorer.");
      return;
    }

    const humans = context.channel.members.filter((member) => !member.user.bot).size;
    const threshold = computeSkipThreshold(humans, env.voteSkipMin, env.voteSkipRatio);
    const result = await context.player.voteSkip(interaction.user.id, threshold);
    await replyTemporary(
      interaction,
      result.skipped ? "⏭ Assez de votes — morceau ignoré." : `🗳️ Vote enregistré (${result.votes}/${threshold}).`,
    );
  },
};
