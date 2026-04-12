import { workItemStatusRank } from "../lib/work-item-status";
import type { TicketRecord } from "../storage/projection";

/**
 * Allowed `--sort-by` values for `ticket read` list mode.
 */
export const TICKET_LIST_SORT_FIELDS = [
  "id",
  "title",
  "status",
  "storyId",
  "createdAt",
  "updatedAt",
  "statusChangedAt",
  "assignee",
  "githubIssueNumber",
  "lastPrActivityAt",
] as const;

/**
 * One dimension the ticket list may be ordered by.
 */
export type TicketListSortField = (typeof TICKET_LIST_SORT_FIELDS)[number];

/**
 * Sort direction for ticket list ordering.
 */
export type TicketListSortDir = "asc" | "desc";

/** Default `--sort-by` when the flag is omitted or empty. */
export const DEFAULT_TICKET_LIST_SORT_FIELD: TicketListSortField = "id";

/** Default `--sort-dir` when the flag is omitted or empty. */
export const DEFAULT_TICKET_LIST_SORT_DIR: TicketListSortDir = "asc";

/**
 * Parses `--sort-by` for `ticket read` list mode.
 *
 * @param raw - Raw flag value; empty or undefined selects {@link DEFAULT_TICKET_LIST_SORT_FIELD}.
 * @returns The parsed field, or `undefined` when `raw` is non-empty but not a supported keyword.
 */
export const tryParseTicketListSortField = (
  raw: string | undefined,
): TicketListSortField | undefined => {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TICKET_LIST_SORT_FIELD;
  }
  const t = raw.trim();
  if ((TICKET_LIST_SORT_FIELDS as readonly string[]).includes(t)) {
    return t as TicketListSortField;
  }
  return undefined;
};

/**
 * Parses `--sort-dir` for `ticket read` list mode.
 *
 * @param raw - Raw flag value; empty or undefined selects {@link DEFAULT_TICKET_LIST_SORT_DIR}.
 * @returns The parsed direction, or `undefined` when `raw` is non-empty but not `asc` or `desc` (case-insensitive).
 */
export const tryParseTicketListSortDir = (
  raw: string | undefined,
): TicketListSortDir | undefined => {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TICKET_LIST_SORT_DIR;
  }
  const t = raw.trim().toLowerCase();
  if (t === "asc" || t === "desc") {
    return t;
  }
  return undefined;
};

/**
 * Converts an ISO-8601 audit instant to milliseconds for ordering.
 * Non-finite parses sort **last** in ascending time order (larger ms).
 *
 * @param iso - Durable timestamp string from projection rows.
 * @returns Epoch milliseconds, or positive infinity when `Date.parse` is not finite.
 */
export const auditInstantMsForSort = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
};

/**
 * Milliseconds of the latest `prActivityRecent` event, or positive infinity when absent.
 *
 * @param ticket - Ticket row from projection.
 * @returns `occurredAt` of the tail activity as ms since epoch, or infinity.
 */
export const lastPrActivityMsForSort = (ticket: TicketRecord): number => {
  const recent = ticket.prActivityRecent;
  if (recent === undefined || recent.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const tail = recent.at(-1);
  if (tail === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return auditInstantMsForSort(tail.occurredAt);
};

/**
 * Primary ascending comparison for two tickets (before applying `--sort-dir` or id tie-break).
 *
 * @param a - First ticket.
 * @param b - Second ticket.
 * @param field - Sort dimension.
 * @returns Negative when `a` should precede `b` in ascending order for `field`.
 */
const compareTicketRecordsPrimaryAsc = (
  a: TicketRecord,
  b: TicketRecord,
  field: TicketListSortField,
): number => {
  switch (field) {
    case "id":
      return a.id.localeCompare(b.id);
    case "title":
      return a.title.localeCompare(b.title);
    case "status":
      return workItemStatusRank(a.status) - workItemStatusRank(b.status);
    case "storyId":
      return a.storyId.localeCompare(b.storyId);
    case "createdAt":
      return (
        auditInstantMsForSort(a.createdAt) - auditInstantMsForSort(b.createdAt)
      );
    case "updatedAt":
      return (
        auditInstantMsForSort(a.updatedAt) - auditInstantMsForSort(b.updatedAt)
      );
    case "statusChangedAt":
      return (
        auditInstantMsForSort(a.statusChangedAt) -
        auditInstantMsForSort(b.statusChangedAt)
      );
    case "assignee": {
      const sa = a.assignee;
      const sb = b.assignee;
      const hasA = sa !== undefined && sa !== "";
      const hasB = sb !== undefined && sb !== "";
      if (!hasA && !hasB) {
        return 0;
      }
      if (!hasA) {
        return 1;
      }
      if (!hasB) {
        return -1;
      }
      return sa.localeCompare(sb);
    }
    case "githubIssueNumber": {
      const na = a.githubIssueNumber;
      const nb = b.githubIssueNumber;
      const hasA = na !== undefined && Number.isFinite(na);
      const hasB = nb !== undefined && Number.isFinite(nb);
      if (!hasA && !hasB) {
        return 0;
      }
      if (!hasA) {
        return 1;
      }
      if (!hasB) {
        return -1;
      }
      return na - nb;
    }
    case "lastPrActivityAt":
      return lastPrActivityMsForSort(a) - lastPrActivityMsForSort(b);
  }
};

/**
 * Comparator for sorting ticket records in list mode (stable: ties break on `id` ascending).
 *
 * @param a - First ticket.
 * @param b - Second ticket.
 * @param field - Sort dimension.
 * @param dir - Sort direction.
 * @returns Standard sort comparator result.
 */
export const compareTicketsForListSort = (
  a: TicketRecord,
  b: TicketRecord,
  field: TicketListSortField,
  dir: TicketListSortDir,
): number => {
  let c = compareTicketRecordsPrimaryAsc(a, b, field);
  if (dir === "desc") {
    c = -c;
  }
  if (c !== 0) {
    return c;
  }
  return a.id.localeCompare(b.id);
};

/**
 * Returns a new array of tickets sorted for CLI list output.
 *
 * @param tickets - Active filtered tickets (caller omits deleted rows).
 * @param field - Sort dimension.
 * @param dir - Sort direction.
 * @returns Sorted shallow copy.
 */
export const sortTicketRecordsForList = (
  tickets: readonly TicketRecord[],
  field: TicketListSortField,
  dir: TicketListSortDir,
): TicketRecord[] =>
  [...tickets].sort((x, y) => compareTicketsForListSort(x, y, field, dir));
