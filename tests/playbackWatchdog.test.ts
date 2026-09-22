import { AudioPlayerStatus, createAudioPlayer } from "@discordjs/voice";
import { describe, expect, it } from "vitest";
import { waitForStatus } from "../src/audio/playbackWatchdog";

describe("waitForStatus", () => {
  it("rejects when the player errors before reaching the target status", async () => {
    const player = createAudioPlayer();
    const promise = waitForStatus(player, AudioPlayerStatus.Playing, 1_000);

    player.emit("error", new Error("boom"));

    await expect(promise).rejects.toThrow("boom");
  });

  it("rejects after the timeout when the target status never arrives", async () => {
    const player = createAudioPlayer();

    await expect(waitForStatus(player, AudioPlayerStatus.Playing, 25)).rejects.toThrow(/Timed out/);
  });

  it("ignores unrelated status transitions", async () => {
    const player = createAudioPlayer();
    const promise = waitForStatus(player, AudioPlayerStatus.Playing, 25);

    player.emit(AudioPlayerStatus.Idle);

    await expect(promise).rejects.toThrow(/Timed out/);
  });

  it("resolves immediately when the timeout is disabled", async () => {
    const player = createAudioPlayer();

    await expect(waitForStatus(player, AudioPlayerStatus.Playing, 0)).resolves.toBeUndefined();
  });
});
