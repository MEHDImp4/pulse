import { describe, expect, it } from "vitest";
import { fairQueueOrder } from "../src/music/fairQueue";
import { QueueManager } from "../src/music/QueueManager";
import type { Track } from "../src/music/Track";

function song(id: string, user: string): Track {
  return { id, title: id, webpageUrl: "https://youtube.com/watch?v=abc",
    requestedBy: { id: user, username: user }, provider: "youtube" };
}

describe("fairQueueOrder", () => {
  it("alternates requesters without changing their internal song ordering", () => {
    const tracks = [song("a1", "a"), song("a2", "a"), song("a3", "a"), song("b1", "b"), song("b2", "b"), song("c1", "c")];
    expect(fairQueueOrder(tracks).map((t) => t.id)).toEqual(["a1", "b1", "c1", "a2", "b2", "a3"]);
  });
  it("works with empty and single-user queues", () => {
    expect(fairQueueOrder([])).toEqual([]);
    expect(fairQueueOrder([song("a", "u"), song("b", "u")]).map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("reorders QueueManager in place for persistence and playback", () => {
    const q = new QueueManager(20);
    [song("a1","a"),song("a2","a"),song("b1","b")].forEach(t=>q.enqueue(t));
    q.fairQueue();
    expect(q.snapshot().map((t) => t.id)).toEqual(["a1", "b1", "a2"]);
    expect(q.dequeue()?.id).toBe("a1");
  });
});
