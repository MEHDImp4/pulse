import { describe, expect, it, vi } from "vitest";
import { YouTubeSuggestions } from "../src/services/suggestions";

describe("YouTubeSuggestions request coalescing", () => {
  it("sends one request for overlapping identical suggestions", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async () => {
      await gate;
      return ["query", ["Song A", "Song B"]];
    });
    const service = new YouTubeSuggestions(800, fetcher);
    const a = service.suggest("  Some Song ", 10);
    const b = service.suggest("some song", 10);
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    release();
    expect(await Promise.all([a, b])).toEqual([
      [{ name: "Song A", value: "Song A" }, { name: "Song B", value: "Song B" }],
      [{ name: "Song A", value: "Song A" }, { name: "Song B", value: "Song B" }],
    ]);
    await service.suggest("some song", 10);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed lookup", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["q", ["Recovered"]]);
    const service = new YouTubeSuggestions(800, fetcher);
    expect(await service.suggest("q")).toEqual([]);
    expect(await service.suggest("q")).toEqual([{ name: "Recovered", value: "Recovered" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
