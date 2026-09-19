import { describe, expect, it } from "vitest";
import {
  musicControlId,
  musicControlsRow,
  parseMusicControl,
  parseQueuePage,
  queuePageId,
} from "../src/ui/controls";

describe("music control custom ids", () => {
  it("round-trips channel and action", () => {
    expect(parseMusicControl(musicControlId("123", "pause"))).toEqual({
      channelId: "123",
      action: "pause",
    });
  });

  it("rejects unknown prefixes, actions and malformed ids", () => {
    expect(parseMusicControl("queue:page:0")).toBeNull();
    expect(parseMusicControl("mc:123")).toBeNull();
    expect(parseMusicControl("mc::pause")).toBeNull();
    expect(parseMusicControl("mc:123:")).toBeNull();
    expect(parseMusicControl("mc:123:bogus")).toBeNull();
  });

  it("parses seek actions", () => {
    expect(parseMusicControl("mc:42:seekback")).toEqual({ channelId: "42", action: "seekback" });
    expect(parseMusicControl("mc:42:seekforward")).toEqual({ channelId: "42", action: "seekforward" });
  });

  it("routes every button of a row to the same channel", () => {
    const row = musicControlsRow("987654321");
    const ids = row.components.map((component) =>
      "custom_id" in component.data ? component.data.custom_id : undefined,
    );

    expect(ids).toHaveLength(5);
    for (const id of ids) {
      expect(parseMusicControl(id!)?.channelId).toBe("987654321");
    }
  });

  it("renders a single pause/resume toggle driven by the paused state", () => {
    const ids = (isPaused: boolean) =>
      musicControlsRow("42", isPaused).components.map((component) =>
        "custom_id" in component.data ? component.data.custom_id : undefined,
      );

    expect(ids(false)).toContain("mc:42:pause");
    expect(ids(false)).not.toContain("mc:42:resume");
    expect(ids(true)).toContain("mc:42:resume");
    expect(ids(true)).not.toContain("mc:42:pause");
  });
});

describe("queue pagination custom ids", () => {
  it("round-trips channel and page", () => {
    expect(parseQueuePage(queuePageId("42", 3))).toEqual({ channelId: "42", page: 3 });
  });

  it("rejects malformed or non-numeric pages", () => {
    expect(parseQueuePage("mc:42:pause")).toBeNull();
    expect(parseQueuePage("qp:42")).toBeNull();
    expect(parseQueuePage("qp::2")).toBeNull();
    expect(parseQueuePage("qp:42:")).toBeNull();
    expect(parseQueuePage("qp:42:NaN")).toBeNull();
  });
});
