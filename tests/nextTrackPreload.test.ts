import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { NextTrackPreloader } from "../src/audio/NextTrackPreloader";
import { waitForAudioBuffer } from "../src/audio/preloadReady";

describe("waitForAudioBuffer", () => {
  it("waits until the standby pipeline produces actual readable audio", async () => {
    const stream = new PassThrough();
    const pending = waitForAudioBuffer({ playStream: stream } as never, 1_000, new AbortController().signal);
    stream.write(Buffer.alloc(1024));
    await expect(pending).resolves.toBeUndefined();
    stream.destroy();
  });

  it("supports cancelling a pipeline that is no longer next", async () => {
    const stream = new PassThrough();
    const abort = new AbortController();
    const pending = waitForAudioBuffer({ playStream: stream } as never, 1_000, abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow("cancelled");
    stream.destroy();
  });

  it("reports a terminated or failed source before buffer readiness", async () => {
    const stream = new PassThrough();
    const pending = waitForAudioBuffer({ playStream: stream } as never, 1_000, new AbortController().signal);
    stream.destroy();
    await expect(pending).rejects.toThrow("closed");
    stream.destroy();
  });
});

describe("NextTrackPreloader", () => {
  it("prepares only once and hands off the ready audio to playback", async () => {
    const prepared = { id: 1 };
    const prepare = vi.fn(async () => prepared);
    const dispose = vi.fn(async () => {});
    const preload = new NextTrackPreloader(async () => {}, dispose);
    preload.warm("next", prepare);
    preload.warm("next", prepare);
    expect(await preload.take("next", 10)).toBe(prepared);
    expect(prepare).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    expect(preload.key).toBeUndefined();
  });

  it("disposes a prepared pipeline if the queue changes", async () => {
    const old = { id: 1 };
    const current = { id: 2 };
    const dispose = vi.fn(async () => {});
    const preload = new NextTrackPreloader(async () => {}, dispose);
    preload.warm("old", async () => old);
    await Promise.resolve();
    preload.warm("new", async () => current);
    expect(await preload.take("new", 20)).toBe(current);
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledWith(old));
  });

  it("does not leak a slow preparation cancelled while the provider is resolving", async () => {
    let finish!: (value: { id: number }) => void;
    const deferred = new Promise<{ id: number }>((resolve) => { finish = resolve; });
    const dispose = vi.fn(async () => {});
    const preload = new NextTrackPreloader(async () => {}, dispose);
    preload.warm("old", () => deferred);
    preload.cancel();
    finish({ id: 42 });
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledWith({ id: 42 }));
    expect(preload.key).toBeUndefined();
  });

  it("does not cache failed audio and falls back to a fresh stream", async () => {
    const dispose = vi.fn(async () => {});
    const preload = new NextTrackPreloader(async () => { throw new Error("broken audio"); }, dispose);
    preload.warm("bad", async () => ({ id: 0 }));
    expect(await preload.take("bad", 20)).toBeUndefined();
    expect(dispose).toHaveBeenCalledWith({ id: 0 });
    preload.warm("good", async () => ({ id: 1 }));
    expect(await preload.take("good", 20)).toEqual({ id: 1 });
  });

  it("cleans up if playback switches before the standby audio is ready", async () => {
    const prepared = { id: 1 };
    let ready!: () => void;
    const gate = new Promise<void>((resolve) => { ready = resolve; });
    const dispose = vi.fn(async () => {});
    const preload = new NextTrackPreloader(async () => gate, dispose);
    preload.warm("next", async () => prepared);
    expect(await preload.take("next", 1)).toBeUndefined();
    ready();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledWith(prepared));
  });
});
