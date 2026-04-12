import { ulid } from "ulid";

/** Optional collaborators for {@link nextEventRelPath}. */
export type NextEventRelPathDeps = {
  /**
   * Returns the shard id segment (without `part-` prefix); defaults to a new lowercase ULID per call.
   * Inject in tests for deterministic paths.
   */
  nextId?: () => string;
};

/**
 * Builds a shard path `events/YYYY/MM/part-<id>.jsonl` for append-only storage.
 * Uses a fresh ULID per call so concurrent writers rarely target the same file.
 *
 * @param now - Injectable clock for UTC year/month directories.
 * @param deps - Optional `nextId` override for tests.
 * @returns Relative path from the data worktree root.
 */
export const nextEventRelPath = (
  now: Date,
  deps?: NextEventRelPathDeps,
): string => {
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const nextId = deps?.nextId ?? (() => ulid().toLowerCase());
  const part = `part-${nextId()}`;
  return `events/${y}/${m}/${part}.jsonl`;
};
