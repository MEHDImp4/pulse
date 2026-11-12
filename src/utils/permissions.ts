import { PermissionFlagsBits, type PermissionsBitField } from "discord.js";

export const DJ_ONLY_MESSAGE =
  "❌ Réservé aux modérateurs ou à un rôle DJ autorisé.";

/**
 * Whether a member may run the disruptive controls (skip, stop, seek, clear,
 * remove, shuffle, loop). Pause/resume, volume and vote-skip stay open to
 * everyone in the voice channel.
 */
export function canUseDjControls(
  permissions: Readonly<PermissionsBitField> | null | undefined,
  memberRoles: readonly string[] = [],
  djRoles: readonly string[] = [],
): boolean {
  if (permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return memberRoles.some((roleId) => djRoles.includes(roleId));
}
