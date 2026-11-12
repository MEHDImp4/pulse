import type { Track } from "./Track";

/** Round-robin by requester; preserve each person's song order. */
export function fairQueueOrder(tracks: readonly Track[]): Track[] {
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const group = groups.get(track.requestedBy.id) ?? [];
    group.push(track);
    groups.set(track.requestedBy.id, group);
  }
  const ordered: Track[] = [];
  let remaining = tracks.length;
  while (remaining > 0) {
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) {
        ordered.push(next);
        remaining--;
      }
    }
  }
  return ordered;
}
