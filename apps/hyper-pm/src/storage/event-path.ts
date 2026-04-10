/**
 * Builds a shard path `events/YYYY/MM/part-ulid.jsonl` for append-only storage.
 *
 * @param now -Injectable clock.
 */
export const nextEventRelPath = (now: Date): string => {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const part = `part-${Date.now()}`;
  return `events/${y}/${m}/${part}.jsonl`;
};
