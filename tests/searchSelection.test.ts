import { describe, expect, it } from "vitest";
import { SearchSelectionStore } from "../src/services/searchSelection";
import type { Track } from "../src/music/Track";
const song: Track = { id: "a", title: "A", webpageUrl: "https://youtube.com/watch?v=a",
  requestedBy: { id: "u", username: "U" }, provider: "youtube" };
describe("search result selection", () => {
  it("is scoped to guild and user and can be claimed only once", () => {
    const store = new SearchSelectionStore();
    const id = store.create({ guildId: "g", userId: "u", channelId: "c", tracks: [song] });
    expect(store.take(id, "other", "u", 0)).toBeUndefined();
    expect(store.take(id, "g", "other", 0)).toBeUndefined();
    expect(store.take(id, "g", "u", 3)).toBeUndefined();
    expect(store.take(id, "g", "u", 0)).toEqual(song);
    expect(store.take(id, "g", "u", 0)).toBeUndefined();
  });
  it("expires after two minutes", () => {
    let clock = 1;
    const store = new SearchSelectionStore(() => clock);
    const id = store.create({ guildId: "g", userId: "u", channelId: "c", tracks: [song] });
    clock += 120_001;
    expect(store.context(id, "g", "u")).toBeUndefined();
  });
});
