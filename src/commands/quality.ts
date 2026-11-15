import { SlashCommandBuilder } from "discord.js";
import { refreshNowPlaying } from "../services/nowPlaying";
import { replyTemporary } from "../utils/reply";
import { requireControlChannel } from "./helpers";
import type { CommandDefinition } from "./types";

/** Independent audio quality controls for each voice session. */
export const quality: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("quality")
    .setDescription("Règle la qualité audio et les fondus (sans modifier le volume)")
    .addBooleanOption((option) =>
      option.setName("normalize")
        .setDescription("Égaliser les différences de volume entre musiques (loudnorm)")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName("trim_silence")
        .setDescription("Couper les silences au tout début des morceaux (pas au milieu)")
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option.setName("fade")
        .setDescription("Durée des fondus en secondes (0 = désactivés, 1 à 5)")
        .setMinValue(0)
        .setMaxValue(5)
        .setRequired(false),
    ),
  cooldownSeconds: 3,
  usage: "/quality [normalize:true|false] [trim_silence:true|false] [fade:0..5]",
  async execute(interaction, { players }) {
    const context = await requireControlChannel(interaction, players);
    if (!context) return;

    const normalize = interaction.options.getBoolean("normalize");
    const trimStartSilence = interaction.options.getBoolean("trim_silence");
    const fadeSeconds = interaction.options.getInteger("fade");
    const requested = normalize !== null || trimStartSilence !== null || fadeSeconds !== null;

    if (requested) {
      context.player.setQuality({
        ...(normalize === null ? {} : { normalize }),
        ...(trimStartSilence === null ? {} : { trimStartSilence }),
        ...(fadeSeconds === null ? {} : { fadeSeconds }),
      });

      // FFmpeg filter changes only take effect on newly-created pipelines.
      // Reload the current song once, keeping its approximate position.
      if (context.player.currentTrack) {
        const position = Math.floor((context.player.playbackElapsedMs ?? 0) / 1_000);
        try {
          await context.player.seek(position);
        } catch (error) {
          await replyTemporary(interaction,
            "❌ Réglages enregistrés, mais la lecture en cours n'a pas pu être relancée. Ils s'appliqueront au prochain titre.");
          return;
        }
      }
      await refreshNowPlaying(context.player);
    }

    const settings = context.player.quality;
    const description = [
      `Normalisation : **${settings.normalize ? "activée" : "désactivée"}**`,
      `Silences au début : **${settings.trimStartSilence ? "supprimés" : "conservés"}**`,
      `Fondus : **${settings.fadeSeconds} seconde(s)**`,
    ];
    await replyTemporary(interaction, `🎚️ Qualité audio du salon :\n${description.join("\n")}`);
  },
};
