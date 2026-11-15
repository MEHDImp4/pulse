import { describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import type { GuildPlayer } from "../src/music/GuildPlayer";

vi.mock("../src/ui/controls", () => ({ playbackControlsRows: () => [] }));
vi.mock("../src/ui/embeds", () => ({ nowPlayingEmbed: () => ({ description: "test" }) }));

import { publishNowPlaying } from "../src/services/nowPlaying";

function fakePlayer(existing?: unknown): GuildPlayer {
  let current = existing;
  return {
    get nowPlayingMessage() { return current; },
    sessionId: "test-session",
    guildId: "test-guild",
    setNowPlayingMessage: vi.fn((message: unknown) => { current = message; }),
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
    const existing = { edit: vi.fn().mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 })) };
    const replacement = { id: "new-card" };
    const send = vi.fn().mockResolvedValue(replacement);
    const player = fakePlayer(existing);

    await publishNowPlaying(fakeInteraction(send), player);

    expect(send).toHaveBeenCalledOnce();
    expect(player.setNowPlayingMessage).toHaveBeenCalledWith(replacement);
  });

  it("never posts duplicate cards when two commands publish simultaneously", async () => {
    let resolveSend!: (message: unknown) => void;
    const pendingSend = new Promise((resolve) => { resolveSend = resolve; });
    const card = { id: "shared", edit: vi.fn().mockResolvedValue(undefined) };
    const send = vi.fn(() => pendingSend);
    const player = fakePlayer();
    const interaction = fakeInteraction(send);

    const first = publishNowPlaying(interaction, player);
    const second = publishNowPlaying(interaction, player);
    expect(send).toHaveBeenCalledOnce();
    resolveSend(card);
    await Promise.all([first, second]);

    expect(send).toHaveBeenCalledOnce();
    expect(card.edit).toHaveBeenCalledOnce();
    expect(player.nowPlayingMessage).toBe(card);
  });

  it("does not spawn a duplicate on transient Discord edit failures", async () => {
    const card = { edit: vi.fn().mockRejectedValue(new Error("rate limited")) };
    const player = fakePlayer(card);
    const send = vi.fn();
    await expect(publishNowPlaying(fakeInteraction(send), player))
      .rejects.toThrow("rate limited");
    expect(send).not.toHaveBeenCalled();
    expect(player.nowPlayingMessage).toBe(card);
  });

  it("reports a missing sendable channel without creating an ephemeral player panel", async () => {
    const player = fakePlayer();
    const send = vi.fn();

    await expect(publishNowPlaying(fakeInteraction(send, false), player))
      .rejects.toThrow("Je ne peux pas envoyer le panneau musical");
    expect(send).not.toHaveBeenCalled();
  });
});
