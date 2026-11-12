import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { djRoleStore } from "../music/DjRoleStore";
import type { CommandDefinition } from "./types";

export const djrole: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("djrole").setDescription("Gère les rôles autorisés à contrôler la musique")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("add").setDescription("Autorise un rôle DJ")
      .addRoleOption((o) => o.setName("role").setDescription("Rôle Discord").setRequired(true)))
    .addSubcommand((s) => s.setName("remove").setDescription("Révoque un rôle DJ")
      .addRoleOption((o) => o.setName("role").setDescription("Rôle Discord").setRequired(true)))
    .addSubcommand((s) => s.setName("list").setDescription("Affiche les rôles DJ")),
  usage: "/djrole add|remove|list",
  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "❌ Permission « Gérer le serveur » obligatoire.", flags: MessageFlags.Ephemeral });
      return;
    }
    const action = interaction.options.getSubcommand();
    if (action === "list") {
      const roles = djRoleStore.getRoles(interaction.guildId);
      await interaction.reply({ content: roles.length ? roles.map((r) => `<@&${r}>`).join(", ") : "ℹ️ Aucun rôle DJ configuré.", flags: MessageFlags.Ephemeral });
      return;
    }
    const role = interaction.options.getRole("role", true);
    const changed = action === "add"
      ? djRoleStore.addRole(interaction.guildId, role.id)
      : djRoleStore.removeRole(interaction.guildId, role.id);
    await interaction.reply({ content: changed ? "✅ Configuration DJ mise à jour." : "ℹ️ Aucun changement.", flags: MessageFlags.Ephemeral });
  },
};
