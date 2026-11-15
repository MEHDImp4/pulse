import type { ChatInputCommandInteraction, Message, StringSelectMenuInteraction } from "discord.js";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * A message is auto-deleted only when the feature is enabled (ttl > 0) and the
 * message carries no components (interactive panels must stay for their buttons).
 */
export function shouldAutoDelete(ttlSeconds: number, componentCount: number): boolean {
  return ttlSeconds > 0 && componentCount === 0;
}

export function scheduleMessageDeletion(message: Message): void {
  if (!shouldAutoDelete(env.autoDeleteSeconds, message.components.length)) return;

  setTimeout(() => {
    void message.delete().catch((error) => {
      logger.debug({ err: error, messageId: message.id }, "Auto-delete of bot message failed");
    });
  }, env.autoDeleteSeconds * 1000);
}

/** Clean up an ephemeral command acknowledgement without touching the public music panel. */
export function scheduleInteractionReplyDeletion(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  delaySeconds = env.autoDeleteSeconds,
): void {
  if (delaySeconds <= 0) return;
  setTimeout(() => {
    void interaction.deleteReply().catch((error) => {
      logger.debug({ err: error, interactionId: interaction.id }, "Ephemeral command cleanup failed");
    });
  }, delaySeconds * 1000);
}

/** Replies with a transient text message that is deleted after the configured delay. */
export async function replyTemporary(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
    if (!content.startsWith("❌")) scheduleInteractionReplyDeletion(interaction);
    return;
  }
  const message = await interaction.reply({ content, fetchReply: true, allowedMentions: { parse: [] } });
  scheduleMessageDeletion(message);
}
