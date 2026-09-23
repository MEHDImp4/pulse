import type { GuildPlayer } from "../music/GuildPlayer";
import type { PlayerManager } from "../music/PlayerManager";
import { playbackControlsRows } from "../ui/controls";
import { nowPlayingEmbed } from "../ui/embeds";
import { logger } from "../utils/logger";

/** The fields whose value changes the rendered now-playing card. */
export interface NowPlayingSnapshot {
  trackId: string;
  state: string;
  elapsedSecond: number;
  volume: number;
  filter: string;
  loopMode: string;
  autoplay: boolean;
  queueSize: number;
}

/** Stable signature of the card; two equal signatures render identically. */
export function renderSignature(snapshot: NowPlayingSnapshot): string {
  return [
    snapshot.trackId,
    snapshot.state,
    snapshot.elapsedSecond,
    snapshot.volume,
    snapshot.filter,
    snapshot.loopMode,
    snapshot.autoplay ? "1" : "0",
    snapshot.queueSize,
  ].join("|");
}

export function playerSnapshot(player: GuildPlayer): NowPlayingSnapshot | undefined {
  const track = player.currentTrack;
  if (!track) return undefined;
  return {
    trackId: track.id,
    state: player.state,
    elapsedSecond: Math.floor((player.playbackElapsedMs ?? 0) / 1000),
    volume: player.volume,
    filter: player.filter,
    loopMode: player.loopMode,
    autoplay: player.autoplay,
    queueSize: player.queueSize,
  };
}

// Last rendered signature per session, so identical frames are not re-sent to
// Discord (e.g. a paused card no longer issues a REST edit every second).
const lastSignatures = new Map<string, string>();
const MAX_SIGNATURES = 5_000;

function rememberSignature(sessionId: string, signature: string): void {
  lastSignatures.delete(sessionId);
  lastSignatures.set(sessionId, signature);
  if (lastSignatures.size > MAX_SIGNATURES) {
    const oldest = lastSignatures.keys().next().value;
    if (oldest !== undefined) lastSignatures.delete(oldest);
  }
}

function buildPayload(player: GuildPlayer): {
  embeds: ReturnType<typeof nowPlayingEmbed>[];
  components: ReturnType<typeof playbackControlsRows>;
} {
  return {
    embeds: [nowPlayingEmbed(player)],
    components: playbackControlsRows(player.channelId, player.state === "PAUSED"),
  };
}

/** Immediately re-renders the live now-playing panel (e.g. after a volume change). */
export async function refreshNowPlaying(player: GuildPlayer): Promise<void> {
  const message = player.nowPlayingMessage;
  const snapshot = playerSnapshot(player);
  if (!message || !snapshot) return;

  const signature = renderSignature(snapshot);
  if (lastSignatures.get(player.sessionId) === signature) return;

  try {
    await message.edit(buildPayload(player));
    rememberSignature(player.sessionId, signature);
  } catch (error) {
    logger.debug({ err: error, guild: player.guildId }, "Immediate now playing update failed");
  }
}

/**
 * Periodically refreshes the live now-playing card. When the queue ends the
 * card is switched once to its idle placeholder (no components); it is deleted
 * when the player is destroyed (bot leaves the voice channel). A tick is
 * skipped while a previous edit for the same session is still in flight, and
 * while the rendered card would be identical (so a paused card is not rewritten
 * every second). Returns a stop function.
 */
export function startNowPlayingUpdater(players: PlayerManager, intervalMs = 1_000): () => void {
  const inFlight = new Set<string>();

  const timer = setInterval(() => {
    for (const player of players.activePlayers()) {
      const message = player.nowPlayingMessage;
      if (!message) continue;

      const key = player.sessionId;
      if (inFlight.has(key)) continue;

      if (!player.currentTrack) {
        if (!player.nowPlayingIdle) {
          player.nowPlayingIdle = true;
          lastSignatures.delete(key);
          inFlight.add(key);
          void message
            .edit({ embeds: [nowPlayingEmbed(player)], components: [] })
            .catch((error) => {
              logger.debug({ err: error, guild: player.guildId }, "Now playing idle render failed");
            })
            .finally(() => inFlight.delete(key));
        }
        continue;
      }

      player.nowPlayingIdle = false;

      if (player.state !== "PLAYING" && player.state !== "PAUSED") continue;

      const snapshot = playerSnapshot(player);
      if (!snapshot) continue;
      const signature = renderSignature(snapshot);
      if (lastSignatures.get(key) === signature) continue;

      // Building the embed synchronously can throw on invalid remote URLs; a
      // throw here would otherwise escape the setInterval and crash the process.
      try {
        const payload = buildPayload(player);
        inFlight.add(key);
        void message
          .edit(payload)
          .then(() => {
            rememberSignature(key, signature);
          })
          .catch((error) => {
            logger.debug({ err: error, guild: player.guildId }, "Now playing update failed");
            lastSignatures.delete(key);
            player.setNowPlayingMessage(undefined);
          })
          .finally(() => inFlight.delete(key));
      } catch (error) {
        logger.debug({ err: error, guild: player.guildId }, "Now playing render failed");
        lastSignatures.delete(key);
        player.setNowPlayingMessage(undefined);
      }
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
