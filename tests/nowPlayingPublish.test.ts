import { describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import type { GuildPlayer } from "../src/music/GuildPlayer";

vi.mock("../src/ui/controls", () => ({ playbackControlsRows: () => [] }));
vi.mock("../src/ui/embeds", () => ({ nowPlayingEmbed: () => ({ description: "test" }) }));

import { publishNowPlaying } from "../src/services/nowPlaying";

function fakePlayer(existing?: unknown): GuildPlayer {
  return {
    nowPlayingMessage: existing,
    sessionId: "test-session",
    guildId: "test-guild",
    setNowPlayingMessage: vi.fn(),
  } as unknown as GuildPlayer;
}

function fakeInteraction(send: ReturnType<typeof vi.fn>, sendable = true): ChatInputCommandInteraction {
  return {
    channel: { isSendable: () => sendable, send },
  } as unknown as ChatInputCommandInteraction;
}

describe("publishNowPlaying", () => {
  it("sends the persistent music card as a normal channel message, not a slash reply", async () => {
    const message = { id: "card" };
    const send = vi.fn().mockResolvedValue(message);
    const player = fakePlayer();
    const interaction = fakeInteraction(send);

    await publishNowPlaying(interaction, player);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      embeds: expect.any(Array),
      components: [],
    }));
    expect(player.setNowPlayingMessage).toHaveBeenCalledWith(message);
  });

  it("edits an existing music card instead of publishing a duplicate", async () => {
    const existing = { edit: vi.fn().mockResolvedValue(undefined) };
    const player = fakePlayer(existing);
    const send = vi.fn();
    const interaction = fakeInteraction(send);

    await publishNowPlaying(interaction, player);

    expect(existing.edit).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    expect(player.setNowPlayingMessage).toHaveBeenCalledWith(existing);
  });

  it("creates a replacement if the existing card was deleted", async () => {
    const existing = { edit: vi.fn().mockRejectedValue(new Error("Unknown Message")) };
    const replacement = { id: "new-card" };
    const send = vi.fn().mockResolvedValue(replacement);
    const player = fakePlayer(existing);

    await publishNowPlaying(fakeInteraction(send), player);

    expect(send).toHaveBeenCalledOnce();
    expect(player.setNowPlayingMessage).toHaveBeenCalledWith(replacement);
  });

  it("reports a missing sendable channel without creating an ephemeral player panel", async () => {
    const player = fakePlayer();
    const send = vi.fn();

    await expect(publishNowPlaying(fakeInteraction(send, false), player))
      .rejects.toThrow("Je ne peux pas envoyer le panneau musical");
    expect(send).not.toHaveBeenCalled();
  });
});
