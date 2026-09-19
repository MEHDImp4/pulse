import type { LoopMode } from "../music/GuildPlayer";
import type { PlayerState } from "../music/PlayerState";

/** Sober, shared palette. State is conveyed by the label, not by a rainbow. */
export const COLORS = {
  primary: 0x5865f2,
  muted: 0x4e5058,
  error: 0xed4245,
} as const;

/** French labels for the internal player states (never show the raw enum). */
export const STATE_LABELS: Record<PlayerState, string> = {
  IDLE: "En attente",
  CONNECTING: "Connexion…",
  BUFFERING: "Chargement…",
  PLAYING: "En lecture",
  PAUSED: "En pause",
  STOPPING: "Arrêt…",
  ERROR: "Erreur",
};

export const LOOP_LABELS: Record<LoopMode, string> = {
  off: "désactivée",
  track: "morceau",
  queue: "file",
};

export function stateColor(state: PlayerState): number {
  if (state === "ERROR") return COLORS.error;
  if (state === "PAUSED" || state === "IDLE" || state === "STOPPING" || state === "CONNECTING") {
    return COLORS.muted;
  }
  return COLORS.primary;
}
