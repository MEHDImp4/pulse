import { randomBytes } from "node:crypto";
import type { Track } from "../music/Track";

interface PendingSelection {
  guildId: string;
  userId: string;
  channelId: string;
  tracks: Track[];
  expiresAt: number;
}

export class SearchSelectionStore {
  private readonly items = new Map<string, PendingSelection>();
  constructor(private readonly now: () => number = Date.now) {}

  create(entry: Omit<PendingSelection, "expiresAt">): string {
    for (const [id, value] of this.items) if (value.expiresAt <= this.now()) this.items.delete(id);
    while (this.items.size >= 500) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
    const id = randomBytes(12).toString("base64url");
    this.items.set(id, { ...entry, expiresAt: this.now() + 120_000 });
    return id;
  }

  context(id: string, guildId: string | null, userId: string): PendingSelection | undefined {
    const entry = this.items.get(id);
    if (!entry || entry.expiresAt <= this.now()) {
      this.items.delete(id);
      return undefined;
    }
    return entry.guildId === guildId && entry.userId === userId ? entry : undefined;
  }

  take(id: string, guildId: string | null, userId: string, index: number): Track | undefined {
    const entry = this.context(id, guildId, userId);
    if (!entry || !Number.isInteger(index) || index < 0 || index >= entry.tracks.length) return undefined;
    this.items.delete(id);
    return entry.tracks[index];
  }
}
export const searchSelections = new SearchSelectionStore();
