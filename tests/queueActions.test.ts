import { describe, expect, it } from "vitest";
import {
  queueActionId, parseQueueAction, queueActionRow, queueSelectRow,
  parseQueueSelect, queueSelectId, queueTrackFingerprint,
} from "../src/ui/controls";
import type { Track } from "../src/music/Track";

function track(id: string, user = "tester"): Track {
  return {
    id, title: "Titre " + id, provider: "youtube", duration: 100,
    webpageUrl: "https://youtube.com/watch?v=" + id,
    requestedBy: { id: user, username: user },
  };
}

describe("interactive Discord queue", () => {
  it("generates valid selector and action IDs with a fixed track fingerprint", () => {
    const song = track("abc");
    const hash = queueTrackFingerprint(song);
    expect(hash).toMatch(/^[a-f0-9]{12}$/);
    expect(parseQueueSelect(queueSelectId("12345678901234567"))).toBe("12345678901234567");
    const id = queueActionId("12345678901234567", "remove", 12, hash);
    expect(parseQueueAction(id)).toEqual({
      channelId: "12345678901234567", action: "remove", position: 12, fingerprint: hash,
    });
    expect(id.length).toBeLessThan(100);
  });

  it("rejects malformed selectors and unauthorized action strings", () => {
    expect(parseQueueSelect("qs:")).toBeUndefined();
    expect(parseQueueSelect("other:123")).toBeUndefined();
    expect(parseQueueAction("qa:123:ban:1:abcdefabcdef")).toBeUndefined();
    expect(parseQueueAction("qa:123:remove:-1:abcdefabcdef")).toBeUndefined();
    expect(parseQueueAction("qa:123:up:1:not-a-hash")).toBeUndefined();
  });

  it("offers only tracks on the requested queue page", () => {
    const all = Array.from({ length: 18 }, (_, i) => track(String(i)));
    const row = queueSelectRow("4321", all, 1);
    const options = row.components[0].toJSON().options;
    expect(options).toHaveLength(8);
    expect(options[0].label).toContain("11. Titre 10");
    expect(options[0].value).toBe(`10:${queueTrackFingerprint(all[10])}`);
    expect(options.at(-1)?.label).toContain("18. Titre 17");
  });

  it("disables impossible up/down movements but always allows removing", () => {
    const top = queueActionRow("42", 0, queueTrackFingerprint(track("a")), 3);
    const last = queueActionRow("42", 2, queueTrackFingerprint(track("c")), 3);
    expect(top.components[0].toJSON().disabled).toBe(true);
    expect(top.components[1].toJSON().disabled).not.toBe(true);
    expect(last.components[1].toJSON().disabled).toBe(true);
    expect(last.components[2].toJSON().disabled).not.toBe(true);
  });

  it("changes the fingerprint when a different requester has queued the same song", () => {
    expect(queueTrackFingerprint(track("one", "a"))).not.toBe(queueTrackFingerprint(track("one", "b")));
  });
});
