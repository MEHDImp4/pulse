import { describe, expect, it, vi } from "vitest";
import { visibleStatusSessions } from "../src/commands/status";

describe("visibleStatusSessions", () => {
  it("only reads the invoking guild and hides disconnected sessions", () => {
    const getForGuild = vi.fn((guildId: string) => guildId === "allowed"
      ? [{ id: "one", isConnected: true }, { id: "two", isConnected: false }]
      : [{ id: "secret", isConnected: true }]);
    expect(visibleStatusSessions({ getForGuild }, "allowed")).toEqual([{ id: "one", isConnected: true }]);
    expect(getForGuild).toHaveBeenCalledTimes(1);
    expect(getForGuild).toHaveBeenCalledWith("allowed");
  });

  it("returns nothing when used outside a server", () => {
    const getForGuild = vi.fn(() => [{ isConnected: true }]);
    expect(visibleStatusSessions({ getForGuild }, null)).toEqual([]);
    expect(getForGuild).not.toHaveBeenCalled();
  });
});
