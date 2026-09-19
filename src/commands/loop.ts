import { SlashCommandBuilder } from "discord.js";
import { LOOP_MODES } from "../music/GuildSettingsStore";
import type { LoopMode } from "../music/GuildPlayer";
import { canUseDjControls, DJ_ONLY_MESSAGE } from "../utils/permissions";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

const LABELS: Record<string, string> = {
  off: "désactivé",
  track: "morceau en boucle",
  queue: "file en boucle",
};

export const loop: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Règle la répétition (désactivé / morceau / file)")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Mode de répétition")
        .setRequired(false)
        .addChoices(
          { name: "Désactivé", value: "off" },
          { name: "Morceau", value: "track" },
          { name: "File", value: "queue" },
        ),
    ),
  usage: "/loop mode:<off|track|queue>",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    const mode = interaction.options.getString("mode");
    if (!mode) {
      await replyTemporary(interaction, `🔁 Répétition actuelle : **${LABELS[context.player.loopMode]}**`);
      return;
    }

    if (!canUseDjControls(interaction.memberPermissions)) {
      await replyTemporary(interaction, DJ_ONLY_MESSAGE);
      return;
    }

    if (!LOOP_MODES.includes(mode as LoopMode)) {
      await replyTemporary(interaction, "❌ Mode de répétition inconnu.");
      return;
    }

    context.player.loopMode = mode as LoopMode;
    await replyTemporary(interaction, `🔁 Répétition réglée sur **${LABELS[mode]}**.`);
  },
};
