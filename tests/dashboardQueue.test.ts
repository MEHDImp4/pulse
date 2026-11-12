import { describe, expect, it } from "vitest";
import { QueueManager } from "../src/music/QueueManager";
import type { Track } from "../src/music/Track";

const track = (id: string): Track => ({
  id, title: id, provider: "youtube", webpageUrl: "https://youtube.com/watch?v=abc",
  requestedBy: { id: "user", username: "User" },
});

describe("dashboard queue movement", () => {
  it("moves a song between positions without dropping tracks", () => {
    const queue = new QueueManager(10);
    ["a", "b", "c"].forEach((id) => queue.enqueue(track(id)));
    expect(queue.move(0, 2)).toBe(true);
    expect(queue.snapshot().map((t) => t.id)).toEqual(["b", "c", "a"]);
    expect(queue.move(1, 0)).toBe(true);
    expect(queue.snapshot().map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
  it("rejects invalid indices without changing the queue", () => {
    const queue = new QueueManager(10);
    queue.enqueue(track("a"));
    expect(queue.move(-1, 0)).toBe(false);
    expect(queue.move(0, 1)).toBe(false);
    expect(queue.snapshot()).toHaveLength(1);
  });
});
