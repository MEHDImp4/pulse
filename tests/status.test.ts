import { describe, expect, it, vi } from "vitest";
import { status, visibleStatusSessions } from "../src/commands/status";
import { PlaybackDiagnostics } from "../src/music/PlaybackDiagnostics";

describe("visibleStatusSessions", () => {
  it("only reads the invoking guild and hides disconnected sessions", () => {
    const getForGuild = vi.fn((guildId: string) => guildId === "allowed"
      ? [{ id: "one", isConnected: true }, { id: "two", isConnected: false }]
      : [{ id: "secret", isConnected: true }]);
    expect(visibleStatusSessions({ getForGuild }, "allowed")).toEqual([{ id: "one", isConnected: true }]);
    expect(getForGuild).toHaveBeenCalledTimes(1);
    expect(getForGuild).toHaveBeenCalledWith("allowed");
  });

  it("returns nothing when used outside a server", () => {
    const getForGuild = vi.fn(() => [{ isConnected: true }]);
    expect(visibleStatusSessions({ getForGuild }, null)).toEqual([]);
    expect(getForGuild).not.toHaveBeenCalled();
  });
});

describe("/status diagnostics", () => {
  it("shows cache and transition health scoped to the invoking guild", async () => {
    const diagnostics = new PlaybackDiagnostics();
    diagnostics.transition(250);
    diagnostics.transition(1_250);
    diagnostics.cacheUsed();
    diagnostics.preloadUsed();
    diagnostics.stallRecovered();

    const reply = vi.fn(async (_payload: unknown) => undefined);
    const getForGuild = vi.fn((guild: string) => guild === "allowed" ? [{
      isConnected: true,
      channelId: "123456789012345678",
      currentTrack: { title: "Public title" },
      state: "PLAYING",
      queueSize: 2,
      volume: 75,
      filter: "off",
      quality: { normalize: false, trimStartSilence: false, fadeSeconds: 2, crossfadeSeconds: 0 },
      autoplay: true,
      voicePing: { ws: 12, udp: 18 },
      diagnostics,
    }] : [{
      isConnected: true,
      channelId: "999999999999999999",
      currentTrack: { title: "Secret title" },
      diagnostics,
    }]);

    const players = {
      getForGuild,
      cacheForGuild: vi.fn((guild: string) => guild === "allowed" ? ({
        queued: 2, ready: 1, downloading: 1, pending: 0, failed: 0,
      }) : ({ queued: 100, ready: 100, downloading: 0, pending: 0, failed: 0 })),
    };
    await status.execute({
      guildId: "allowed",
      client: { ws: { ping: 42 } },
      reply,
    } as never, { players } as never);

    expect(reply).toHaveBeenCalledOnce();
    const embed = reply.mock.calls[0][0] as unknown as { embeds: Array<{ toJSON(): { description?: string; fields?: Array<{name: string; value: string}> } }> };
    const output = embed.embeds[0].toJSON();
    expect(output.description).toContain("p95 1250 ms");
    expect(output.description).toContain("cache 1");
    expect(output.description).not.toContain("Secret");
    expect(output.fields?.find((field) => field.name === "Préchargement de la file")?.value).toContain("1/2 prêtes");
    expect(getForGuild).toHaveBeenCalledExactlyOnceWith("allowed");
    expect(players.cacheForGuild).toHaveBeenCalledExactlyOnceWith("allowed");
  });
});
