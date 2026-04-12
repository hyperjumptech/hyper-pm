import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { EventLine } from "./event-line";
import { nextEventRelPath } from "./event-path";

/** Optional collaborators for {@link appendEventLine}. */
export type AppendEventLineOpts = {
  /**
   * Injectable shard id factory passed through to {@link nextEventRelPath}.
   * Defaults to a new lowercase ULID per append.
   */
  nextEventId?: () => string;
};

/**
 * Appends a single JSONL event under `events/YYYY/MM/` relative to the data worktree root.
 *
 * @param dataRoot - Root of the data branch checkout (temp worktree path).
 * @param event - Fully constructed event line.
 * @param clock - Injectable clock for shard directory selection (UTC year/month).
 * @param opts - Optional `nextEventId` for tests.
 * @returns Relative path of the shard file written.
 */
export const appendEventLine = async (
  dataRoot: string,
  event: EventLine,
  clock: { now: () => Date },
  opts?: AppendEventLineOpts,
): Promise<string> => {
  const rel = nextEventRelPath(clock.now(), {
    nextId: opts?.nextEventId,
  });
  const abs = `${dataRoot.replace(/\/$/, "")}/${rel}`;
  await mkdir(dirname(abs), { recursive: true });
  await appendFile(abs, `${JSON.stringify(event)}\n`, "utf8");
  return rel;
};
