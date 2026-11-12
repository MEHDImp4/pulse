import type { Track } from "./Track";
import { fairQueueOrder } from "./fairQueue";

export class QueueManager {
  private readonly tracks: Track[] = [];

  constructor(private readonly maxSize: number) {}

  enqueue(track: Track): number {
    if (this.tracks.length >= this.maxSize) {
      throw new Error(`Queue limit reached (${this.maxSize})`);
    }
    this.tracks.push(track);
    return this.tracks.length;
  }

  enqueueFront(track: Track): number {
    if (this.tracks.length >= this.maxSize) {
      throw new Error(`Queue limit reached (${this.maxSize})`);
    }
    this.tracks.unshift(track);
    return 1;
  }

  dequeue(): Track | undefined {
    return this.tracks.shift();
  }

  move(from: number, to: number): boolean {
    if (!Number.isInteger(from) || !Number.isInteger(to) ||
      from < 0 || from >= this.tracks.length || to < 0 || to >= this.tracks.length) return false;
    const [track] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, track);
    return true;
  }

  removeAt(index: number): Track | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.tracks.length) return undefined;
    return this.tracks.splice(index, 1)[0];
  }

  fairQueue(): void {
    const ordered = fairQueueOrder(this.tracks);
    this.tracks.splice(0, this.tracks.length, ...ordered);
  }

  shuffle(): void {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  clear(): void {
    this.tracks.length = 0;
  }

  snapshot(): readonly Track[] {
    return [...this.tracks];
  }

  get size(): number {
    return this.tracks.length;
  }

  get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  get isFull(): boolean {
    return this.tracks.length >= this.maxSize;
  }
}
