import { PermissionFlagsBits, type PermissionsBitField } from "discord.js";

export const DJ_ONLY_MESSAGE =
  "❌ Réservé aux modérateurs (permission « Gérer le serveur »).";

/**
 * Whether a member may run the disruptive controls (skip, stop, seek, clear,
 * remove, shuffle, loop). Pause/resume, volume and vote-skip stay open to
 * everyone in the voice channel.
 */
export function canUseDjControls(
  permissions: Readonly<PermissionsBitField> | null | undefined,
): boolean {
  return Boolean(permissions?.has(PermissionFlagsBits.ManageGuild));
}
