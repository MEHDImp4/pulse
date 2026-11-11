import { describe, expect, it } from "vitest";
import type { RequestedBy, Track, TrackProvider } from "../src/music/Track";
import type { AudioProvider, AudioSource } from "../src/providers/AudioProvider";
import { extractAppleTrackId } from "../src/providers/AppleMusicProvider";
import { extractDeezerTrackId } from "../src/providers/DeezerProvider";
import { ProviderRegistry } from "../src/providers/ProviderRegistry";
import { deriveRadioTitle, RadioProvider } from "../src/providers/RadioProvider";
import { extractSpotifyTrackId } from "../src/providers/SpotifyProvider";

class FakeProvider implements AudioProvider {
  constructor(
    public readonly name: TrackProvider,
    private readonly host?: string,
  ) {}

  supports(url: string): boolean {
    return this.host ? url.includes(this.host) : false;
  }

  async search(query: string, requestedBy: RequestedBy): Promise<Track> {
    return this.make(query, requestedBy);
  }

  async resolve(url: string, requestedBy: RequestedBy): Promise<Track> {
    return this.make(url, requestedBy);
  }

  async createSource(): Promise<AudioSource> {
    return { kind: "url", url: "https://example.invalid/audio" };
  }

  private make(id: string, requestedBy: RequestedBy): Track {
    return {
      id,
      title: id,
      webpageUrl: `https://example.invalid/${id}`,
      requestedBy,
      provider: this.name,
    };
  }
}

const requestedBy: RequestedBy = { id: "u1", username: "Tester" };

function makeRegistry() {
  const youtube = new FakeProvider("youtube", "youtube.com");
  const soundcloud = new FakeProvider("soundcloud", "soundcloud.com");
  const radio = new RadioProvider(async () => [{ address: "1.2.3.4" }], []);
  const registry = new ProviderRegistry({
    providers: [youtube, soundcloud],
    fallback: youtube,
    urlFallback: radio,
  });
  return { registry, youtube, soundcloud, radio };
}

describe("ProviderRegistry", () => {
  it("routes known hosts to their provider", async () => {
    const { registry, youtube, soundcloud } = makeRegistry();
    expect(registry.find("https://soundcloud.com/a/b")).toBe(soundcloud);
    expect(registry.find("https://www.youtube.com/watch?v=x")).toBe(youtube);

    const track = await registry.resolve("https://soundcloud.com/a/b", requestedBy);
    expect(track.provider).toBe("soundcloud");
  });

  it("falls back to radio for unknown http urls", () => {
    const { registry, radio } = makeRegistry();
    expect(registry.find("https://stream.example.com/live")).toBe(radio);
    expect(registry.supports("https://stream.example.com/live")).toBe(true);
  });

  it("uses the fallback provider for text search", async () => {
    const { registry, youtube } = makeRegistry();
    const track = await registry.search("hello", requestedBy);
    expect(track.provider).toBe("youtube");
    expect(youtube.supports("hello")).toBe(false);
  });

  it("dispatches playback by track provider", async () => {
    const { registry, radio } = makeRegistry();
    const radioTrack: Track = {
      id: "https://stream.example.com/live",
      title: "Live",
      webpageUrl: "https://stream.example.com/live",
      requestedBy,
      provider: "radio",
      isLive: true,
    };
    expect(registry.providerForTrack(radioTrack)).toBe(radio);
    // Actual radio playback is handled by the DNS-pinned HTTP client, not by FFmpeg URLs.
  });
});

describe("metadata link parsers", () => {
  it("extracts a Deezer track id", () => {
    expect(extractDeezerTrackId("https://www.deezer.com/track/123456")).toBe("123456");
    expect(extractDeezerTrackId("https://www.deezer.com/album/1")).toBeUndefined();
  });

  it("extracts an Apple track id from query or path", () => {
    expect(extractAppleTrackId("https://music.apple.com/fr/album/n/1?i=999")).toBe("999");
    expect(extractAppleTrackId("https://music.apple.com/fr/song/888")).toBe("888");
  });

  it("extracts a Spotify track id", () => {
    expect(extractSpotifyTrackId("https://open.spotify.com/track/abc123XYZ")).toBe("abc123XYZ");
    expect(extractSpotifyTrackId("https://open.spotify.com/album/abc")).toBeUndefined();
  });
});

describe("deriveRadioTitle", () => {
  it("builds a readable title from a stream url", () => {
    expect(deriveRadioTitle("https://radio.example.com:8000/live.mp3")).toContain("live.mp3");
    expect(deriveRadioTitle("not a url")).toBe("not a url");
  });
});
