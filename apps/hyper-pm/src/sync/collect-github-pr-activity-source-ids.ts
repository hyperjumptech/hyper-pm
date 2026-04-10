import { eventLineSchema } from "../storage/event-line";

/**
 * Collects all `sourceId` values from existing `GithubPrActivity` JSONL lines for deduping sync.
 *
 * @param lines - Raw event log lines (may include blanks).
 */
export const collectGithubPrActivitySourceIdsFromLines = (
  lines: string[],
): Set<string> => {
  const set = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const parsed = eventLineSchema.safeParse(json);
    if (!parsed.success || parsed.data.type !== "GithubPrActivity") continue;
    const sid = parsed.data.payload["sourceId"];
    if (typeof sid === "string" && sid.length > 0) {
      set.add(sid);
    }
  }
  return set;
};
