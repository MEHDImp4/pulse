import { SlashCommandBuilder } from "discord.js";
import { djRoleStore, memberRoleIds } from "../music/DjRoleStore";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

export const party: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Mode soirée : équilibre automatiquement les demandes musicales")
    .addStringOption((option) =>
      option.setName("mode")
        .setDescription("Activer ou désactiver le mode soirée")
        .setRequired(false)
        .addChoices(
          { name: "Activer", value: "on" },
          { name: "Désactiver", value: "off" },
        ),
    )
    .addIntegerOption((option) =>
      option.setName("limite")
        .setDescription("Nombre maximal de morceaux en attente par utilisateur (1 à 10)")
        .setMinValue(1).setMaxValue(10).setRequired(false),
    ),
  usage: "/party [mode:on|off] [limite:1..10]",
  cooldownSeconds: 3,
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    const mode = interaction.options.getString("mode");
    const limit = interaction.options.getInteger("limite");
    if (mode !== null || limit !== null) {
      if (!canUseDjControls(
        interaction.memberPermissions,
        memberRoleIds(interaction.member),
        djRoleStore.getRoles(interaction.guildId),
      )) {
        await replyTemporary(interaction, DJ_ONLY_MESSAGE);
        return;
      }
      context.player.configureParty(
        mode === null ? context.player.partyMode : mode === "on",
        limit ?? context.player.partyMaxPerUser,
      );
    }

    await replyTemporary(interaction,
      `🎉 Mode soirée **${context.player.partyMode ? "activé" : "désactivé"}**.\n` +
      `⚖ File équilibrée automatiquement : **${context.player.partyMode ? "oui" : "non"}**.\n` +
      `🎵 Limite par personne : **${context.player.partyMaxPerUser}** morceaux en attente.`,
    );
  },
};
