import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { scheduleInteractionReplyDeletion, shouldAutoDelete } from "../src/utils/reply";

describe("shouldAutoDelete", () => {
  it("deletes transient text messages when enabled", () => {
    expect(shouldAutoDelete(1, 0)).toBe(true);
  });

  it("never deletes messages that carry components", () => {
    expect(shouldAutoDelete(1, 1)).toBe(false);
    expect(shouldAutoDelete(60, 2)).toBe(false);
  });

  it("is disabled when the delay is zero or negative", () => {
    expect(shouldAutoDelete(0, 0)).toBe(false);
    expect(shouldAutoDelete(-5, 0)).toBe(false);
  });
});

describe("scheduleInteractionReplyDeletion", () => {
  afterEach(() => vi.useRealTimers());

  it("removes only the ephemeral acknowledgement after the delay", async () => {
    vi.useFakeTimers();
    const deleteReply = vi.fn().mockResolvedValue(undefined);
    const interaction = { id: "test", deleteReply } as unknown as ChatInputCommandInteraction;

    scheduleInteractionReplyDeletion(interaction, 2);
    expect(deleteReply).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(deleteReply).toHaveBeenCalledOnce();
  });

  it("can be disabled using a zero timeout", async () => {
    vi.useFakeTimers();
    const deleteReply = vi.fn().mockResolvedValue(undefined);
    const interaction = { id: "test", deleteReply } as unknown as ChatInputCommandInteraction;

    scheduleInteractionReplyDeletion(interaction, 0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deleteReply).not.toHaveBeenCalled();
  });
});
