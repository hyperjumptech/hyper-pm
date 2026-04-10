import {
  eventLineSchema,
  type EventLine,
  type EventType,
} from "../storage/event-line";

/** Filters for {@link runAuditOnLines}. */
export type AuditFilters = {
  type?: EventType;
  entityId?: string;
  /** When set and positive, keep only the most recent *n* matches (by `ts`). */
  limit?: number;
};

/**
 * Returns true when the event payload references the given id (common keys only).
 *
 * @param evt - Parsed event line.
 * @param entityId - Epic, story, or ticket id to match.
 */
export const eventTouchesEntityId = (
  evt: EventLine,
  entityId: string,
): boolean => {
  const p = evt.payload;
  for (const key of ["id", "entityId", "ticketId"] as const) {
    const v = p[key];
    if (typeof v === "string" && v === entityId) {
      return true;
    }
  }
  return false;
};

/**
 * Parses JSONL lines into events (skipping blanks), collects invalid rows, applies filters, sorts by `ts`.
 *
 * @param lines - Raw lines from shard files (may include blanks).
 * @param filters - Optional type, entity id, and tail limit.
 */
export const runAuditOnLines = (
  lines: string[],
  filters: AuditFilters,
): {
  events: EventLine[];
  invalidLines: { line: number; message: string }[];
} => {
  const invalidLines: { line: number; message: string }[] = [];
  const events: EventLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (e) {
      invalidLines.push({
        line: i + 1,
        message: e instanceof Error ? e.message : "parse error",
      });
      continue;
    }
    const parsed = eventLineSchema.safeParse(json);
    if (!parsed.success) {
      invalidLines.push({
        line: i + 1,
        message: parsed.error.message,
      });
      continue;
    }
    events.push(parsed.data);
  }

  let filtered = events;
  if (filters.type !== undefined) {
    filtered = filtered.filter((e) => e.type === filters.type);
  }
  if (filters.entityId !== undefined) {
    const entityId = filters.entityId;
    filtered = filtered.filter((e) => eventTouchesEntityId(e, entityId));
  }
  filtered = [...filtered].sort((a, b) => a.ts.localeCompare(b.ts));
  if (filters.limit !== undefined && filters.limit > 0) {
    filtered = filtered.slice(-filters.limit);
  }
  return { events: filtered, invalidLines };
};

/**
 * Builds extra TSV fields for `GithubPrActivity` text audit lines (`ticketId`, `#pr`, `kind`).
 *
 * @param evt - Parsed `GithubPrActivity` event line.
 */
const formatGithubPrActivityAuditTail = (evt: EventLine): string => {
  const p = evt.payload;
  const ticketId = p["ticketId"];
  const pr = p["prNumber"];
  const kind = p["kind"];
  const tid = typeof ticketId === "string" ? ticketId : "";
  const prn = typeof pr === "number" ? String(pr) : String(pr ?? "");
  const k = typeof kind === "string" ? kind : "";
  return `${tid}\t#${prn}\t${k}`;
};

/**
 * Renders audit rows as TSV for `--format text` (`GithubPrActivity` rows include ticket id, PR, and kind).
 *
 * @param events - Filtered events (already sorted).
 */
export const formatAuditTextLines = (events: EventLine[]): string =>
  events
    .map((e) =>
      e.type === "GithubPrActivity"
        ? `${e.ts}\t${e.type}\t${e.actor}\t${e.id}\t${formatGithubPrActivityAuditTail(e)}`
        : `${e.ts}\t${e.type}\t${e.actor}\t${e.id}`,
    )
    .join("\n");
