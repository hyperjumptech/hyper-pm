import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { EventLine } from "./event-line";
import { nextEventRelPath } from "./event-path";

/**
 * Appends a single JSONL event under `events/YYYY/MM/` relative to the data worktree root.
 *
 * @param dataRoot - Root of the data branch checkout (temp worktree path).
 * @param event - Fully constructed event line.
 * @param clock - Injectable clock for shard selection.
 */
export const appendEventLine = async (
  dataRoot: string,
  event: EventLine,
  clock: { now: () => Date },
): Promise<string> => {
  const rel = nextEventRelPath(clock.now());
  const abs = `${dataRoot.replace(/\/$/, "")}/${rel}`;
  await mkdir(dirname(abs), { recursive: true });
  await appendFile(abs, `${JSON.stringify(event)}\n`, "utf8");
  return rel;
};
