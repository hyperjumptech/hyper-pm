import type { GithubPrActivityKind } from "../lib/github-pr-activity";
import type { WorkItemStatus } from "../lib/work-item-status";
import type { Projection, TicketRecord } from "../storage/projection";
import {
  ticketMatchesTicketListQuery,
  type TicketListQuery,
} from "./ticket-list-query";
import {
  DEFAULT_TICKET_LIST_SORT_DIR,
  DEFAULT_TICKET_LIST_SORT_FIELD,
  sortTicketRecordsForList,
  type TicketListSortDir,
  type TicketListSortField,
} from "./ticket-list-sort";

type AuditSummaryFields = {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

/** One row for `epic read` when listing (no `--id`). */
export type EpicListSummary = {
  id: string;
  title: string;
  status: WorkItemStatus;
} & AuditSummaryFields;

/** One row for `story read` when listing (no `--id`). */
export type StoryListSummary = {
  id: string;
  title: string;
  epicId: string;
  status: WorkItemStatus;
} & AuditSummaryFields;

/** Latest linked PR activity for list rows (from replayed `GithubPrActivity`). */
export type TicketLastPrActivitySummary = {
  prNumber: number;
  kind: GithubPrActivityKind;
  occurredAt: string;
};

/** One row for `ticket read` when listing (no `--id`). */
export type TicketListSummary = {
  id: string;
  title: string;
  status: WorkItemStatus;
  storyId: string | null;
  /** Normalized GitHub login when the ticket has an assignee. */
  assignee?: string;
  /** Linked git branch names when non-empty. */
  linkedBranches?: string[];
  lastPrActivity?: TicketLastPrActivitySummary;
} & AuditSummaryFields;

/**
 * Returns non-deleted epics as id/title pairs, sorted by id.
 *
 * @param projection - Replayed event projection.
 */
export const listActiveEpicSummaries = (
  projection: Projection,
): EpicListSummary[] =>
  [...projection.epics.values()]
    .filter((e) => !e.deleted)
    .map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
      updatedAt: e.updatedAt,
      updatedBy: e.updatedBy,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

/** Optional filter for {@link listActiveStorySummaries}. */
export type ListActiveStorySummariesOptions = {
  /** When set, only stories with this `epicId` are included. */
  epicId?: string;
};

/** Optional filter for {@link listActiveTicketSummaries}. */
export type ListActiveTicketSummariesOptions = {
  /** When set, only tickets with this `storyId` are included. */
  storyId?: string;
  /** When set, additional AND filters (status, dates, epic, etc.). */
  query?: TicketListQuery;
  /** Sort field for list rows; defaults to {@link DEFAULT_TICKET_LIST_SORT_FIELD}. */
  sortBy?: TicketListSortField;
  /** Sort direction; defaults to {@link DEFAULT_TICKET_LIST_SORT_DIR}. */
  sortDir?: TicketListSortDir;
};

/**
 * Returns non-deleted stories as id/title/epicId tuples, sorted by id.
 *
 * @param projection - Replayed event projection.
 * @param options - When `epicId` is set, restricts to stories under that epic; omit for all active stories.
 * @returns Sorted list summaries.
 */
export const listActiveStorySummaries = (
  projection: Projection,
  options?: ListActiveStorySummariesOptions,
): StoryListSummary[] =>
  [...projection.stories.values()]
    .filter(
      (s) =>
        !s.deleted &&
        (options?.epicId === undefined || s.epicId === options.epicId),
    )
    .map((s) => ({
      id: s.id,
      title: s.title,
      epicId: s.epicId,
      status: s.status,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

/**
 * Returns non-deleted tickets as compact rows, ordered by `sortBy` / `sortDir` (default id ascending).
 *
 * @param projection - Replayed event projection.
 * @param options - When `storyId` is set, restricts to tickets under that story; omit for all active tickets.
 * @param options.query - Optional advanced filters applied after `storyId` / deleted checks.
 * @param options.sortBy - List sort field; defaults to id.
 * @param options.sortDir - List sort direction; defaults to ascending.
 * @returns Sorted list summaries.
 */
export const listActiveTicketSummaries = (
  projection: Projection,
  options?: ListActiveTicketSummariesOptions,
): TicketListSummary[] => {
  const sortBy = options?.sortBy ?? DEFAULT_TICKET_LIST_SORT_FIELD;
  const sortDir = options?.sortDir ?? DEFAULT_TICKET_LIST_SORT_DIR;

  const filtered: TicketRecord[] = [...projection.tickets.values()].filter(
    (t) => {
      if (t.deleted) {
        return false;
      }
      if (
        options?.storyId !== undefined &&
        (t.storyId === null || t.storyId !== options.storyId)
      ) {
        return false;
      }
      const q = options?.query;
      if (q !== undefined && !ticketMatchesTicketListQuery(t, projection, q)) {
        return false;
      }
      return true;
    },
  );

  const sorted = sortTicketRecordsForList(filtered, sortBy, sortDir);

  return sorted.map((t) => {
    const recent = t.prActivityRecent;
    const last =
      recent !== undefined && recent.length > 0
        ? recent[recent.length - 1]
        : undefined;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      storyId: t.storyId,
      ...(t.assignee !== undefined ? { assignee: t.assignee } : {}),
      ...(t.linkedBranches.length > 0
        ? { linkedBranches: t.linkedBranches }
        : {}),
      ...(last !== undefined
        ? {
            lastPrActivity: {
              prNumber: last.prNumber,
              kind: last.kind,
              occurredAt: last.occurredAt,
            },
          }
        : {}),
      createdAt: t.createdAt,
      createdBy: t.createdBy,
      updatedAt: t.updatedAt,
      updatedBy: t.updatedBy,
    };
  });
};
