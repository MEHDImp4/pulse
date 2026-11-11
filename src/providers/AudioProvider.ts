import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import type { RequestedBy, Track, TrackProvider } from "../music/Track";

export interface PlaylistResult {
  title?: string;
  tracks: Track[];
}

/** Audio streamed through a child process (e.g. yt-dlp) piped into FFmpeg. */
export interface PipeSource {
  kind: "pipe";
  stream: Readable;
  process: ChildProcess;
}

/** Already-validated stream handled by Node; FFmpeg only receives its bytes. */
export interface StreamSource {
  kind: "stream";
  stream: Readable;
  close: () => void;
}

/** Direct URL sources from trusted providers (not used for arbitrary radio links). */
export interface UrlSource {
  kind: "url";
  url: string;
}

export type AudioSource = PipeSource | StreamSource | UrlSource;

export interface AudioProvider {
  readonly name: TrackProvider;
  /** Whether this provider can handle the given URL. */
  supports(url: string): boolean;
  search(query: string, requestedBy: RequestedBy): Promise<Track>;
  resolve(url: string, requestedBy: RequestedBy): Promise<Track>;
  createSource(track: Track): Promise<AudioSource>;
  /** Resolves a playlist URL into individual tracks (optional capability). */
  resolvePlaylist?(url: string, requestedBy: RequestedBy, limit?: number): Promise<PlaylistResult>;
  /** Returns a track related to a seed, excluding already played ids (optional). */
  related?(seed: Track, exclude: ReadonlySet<string>): Promise<Track | undefined>;
}
