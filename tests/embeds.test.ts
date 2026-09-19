import { describe, expect, it } from "vitest";
import { GuildPlayer } from "../src/music/GuildPlayer";
import type { RequestedBy, Track } from "../src/music/Track";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";
import { nowPlayingEmbed, queueEmbed, queuedEmbed } from "../src/ui/embeds";
import { COLORS, STATE_LABELS } from "../src/ui/theme";

const requestedBy: RequestedBy = { id: "u1", username: "Mehdi" };

function makeTrack(id: string, duration?: number): Track {
  return {
    id,
    title: `Titre ${id}`,
    webpageUrl: `https://youtube.com/watch?v=${id}`,
    duration,
    author: "Artiste",
    requestedBy,
    provider: "youtube",
  };
}

class StubProvider implements AudioProvider {
  readonly name = "youtube" as const;
  supports(): boolean {
    return false;
  }
  async search(query: string, by: RequestedBy): Promise<Track> {
    return makeTrack(query);
  }
  async resolve(_url: string, by: RequestedBy): Promise<Track> {
    return makeTrack("url");
  }
  async createSource(): Promise<AudioSource> {
    return { kind: "url", url: "https://example.invalid/audio" };
  }
}

function makePlayer(): GuildPlayer {
  return new GuildPlayer("guild", "channel", new StubProvider(), () => {});
}

describe("theme", () => {
  it("labels player states in French", () => {
    expect(STATE_LABELS.PLAYING).toBe("En lecture");
    expect(STATE_LABELS.PAUSED).toBe("En pause");
    expect(STATE_LABELS.BUFFERING).toBe("Chargement…");
  });
});

describe("queuedEmbed", () => {
  it("shows the action, title and position", () => {
    const json = queuedEmbed(makeTrack("a", 200), { position: 3 }).toJSON();
    expect(json.title).toBe("Ajouté à la file");
    expect(json.description).toContain("Titre a");
    expect(json.fields?.some((field) => field.name === "Position" && field.value === "#3")).toBe(true);
    expect(json.color).toBe(COLORS.muted);
  });

  it("uses the pending wording for /playnext", () => {
    expect(queuedEmbed(makeTrack("b"), { pending: true }).toJSON().title).toBe("Sera joué juste après");
  });
});

describe("nowPlayingEmbed", () => {
  it("renders a muted placeholder without a track", () => {
    const json = nowPlayingEmbed(makePlayer()).toJSON();
    expect(json.color).toBe(COLORS.muted);
    expect(json.description).toBe("Aucun morceau en cours.");
  });
});

describe("queueEmbed", () => {
  it("lists upcoming tracks with their durations", () => {
    const player = makePlayer();
    player.queue.enqueue(makeTrack("a", 65));

    const json = queueEmbed(player, 0).toJSON();
    const upcoming = json.fields?.find((field) => field.name.startsWith("À suivre"));
    expect(upcoming?.value).toContain("Titre a");
    expect(upcoming?.value).toContain("1:05");
  });
});
