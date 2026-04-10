import type { WorkItemStatus } from "../lib/work-item-status";
import type { Projection } from "../storage/projection";

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

/** One row for `ticket read` when listing (no `--id`). */
export type TicketListSummary = {
  id: string;
  title: string;
  status: WorkItemStatus;
  storyId: string;
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

/**
 * Returns non-deleted stories as id/title/epicId tuples, sorted by id.
 *
 * @param projection - Replayed event projection.
 */
export const listActiveStorySummaries = (
  projection: Projection,
): StoryListSummary[] =>
  [...projection.stories.values()]
    .filter((s) => !s.deleted)
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
 * Returns non-deleted tickets as compact rows, sorted by id.
 *
 * @param projection - Replayed event projection.
 */
export const listActiveTicketSummaries = (
  projection: Projection,
): TicketListSummary[] =>
  [...projection.tickets.values()]
    .filter((t) => !t.deleted)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      storyId: t.storyId,
      createdAt: t.createdAt,
      createdBy: t.createdBy,
      updatedAt: t.updatedAt,
      updatedBy: t.updatedBy,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
