import type { WorkItemStatus } from "../lib/work-item-status";
import type { Projection, TicketRecord } from "../storage/projection";

/**
 * Advanced filters for listing tickets (`ticket read` without `--id`).
 *
 * Dimensions combine with **AND**. Multiple `--status` values combine with **OR**
 * (ticket matches if its status is any listed status).
 *
 * Time bounds are **inclusive** on the parsed instant (`>=` after, `<=` before).
 */
export type TicketListQuery = {
  /** When non-empty, ticket status must be one of these. */
  statuses?: readonly WorkItemStatus[];
  /** When set, the ticket's story must exist, not be deleted, and have this `epicId`. */
  epicId?: string;
  /** Inclusive lower bound on `createdAt` (epoch ms). */
  createdAfterMs?: number;
  /** Inclusive upper bound on `createdAt` (epoch ms). */
  createdBeforeMs?: number;
  /** Inclusive lower bound on `updatedAt` (epoch ms). */
  updatedAfterMs?: number;
  /** Inclusive upper bound on `updatedAt` (epoch ms). */
  updatedBeforeMs?: number;
  /** Inclusive lower bound on `statusChangedAt` (epoch ms). */
  statusChangedAfterMs?: number;
  /** Inclusive upper bound on `statusChangedAt` (epoch ms). */
  statusChangedBeforeMs?: number;
  /** Substring match on `createdBy` (case-sensitive). */
  createdByContains?: string;
  /** Substring match on `updatedBy` (case-sensitive). */
  updatedByContains?: string;
  /** Substring match on `statusChangedBy` (case-sensitive). */
  statusChangedByContains?: string;
  /**
   * Lowercase string for case-insensitive substring match on `title`
   * (caller should pass `needle.toLowerCase()`).
   */
  titleContainsLower?: string;
  /** When true, only tickets with a linked GitHub issue number. */
  githubLinkedOnly?: boolean;
};

/**
 * Parses a single CLI date/time string into epoch milliseconds.
 *
 * @param raw - Non-empty string from a flag value.
 * @returns Milliseconds since epoch, or `null` when `Date.parse` is not finite.
 */
export const tryParseIsoDateMillis = (raw: string): number | null => {
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Returns whether a ticket satisfies all constraints in `query`.
 *
 * @param ticket - Active (non-deleted) ticket row.
 * @param projection - Replayed projection (used for story → epic resolution).
 * @param query - Filter dimensions; empty object matches every ticket.
 * @returns True when the ticket passes every set constraint.
 */
export const ticketMatchesTicketListQuery = (
  ticket: TicketRecord,
  projection: Projection,
  query: TicketListQuery,
): boolean => {
  const statuses = query.statuses;
  if (statuses !== undefined && statuses.length > 0) {
    if (!statuses.includes(ticket.status)) {
      return false;
    }
  }

  const epicId = query.epicId;
  if (epicId !== undefined) {
    const story = projection.stories.get(ticket.storyId);
    if (!story || story.deleted || story.epicId !== epicId) {
      return false;
    }
  }

  const parseTs = (iso: string): number | null => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
  };

  const createdMs = parseTs(ticket.createdAt);
  if (createdMs === null) {
    return false;
  }
  if (query.createdAfterMs !== undefined && createdMs < query.createdAfterMs) {
    return false;
  }
  if (
    query.createdBeforeMs !== undefined &&
    createdMs > query.createdBeforeMs
  ) {
    return false;
  }

  const updatedMs = parseTs(ticket.updatedAt);
  if (updatedMs === null) {
    return false;
  }
  if (query.updatedAfterMs !== undefined && updatedMs < query.updatedAfterMs) {
    return false;
  }
  if (
    query.updatedBeforeMs !== undefined &&
    updatedMs > query.updatedBeforeMs
  ) {
    return false;
  }

  const statusChangedMs = parseTs(ticket.statusChangedAt);
  if (statusChangedMs === null) {
    return false;
  }
  if (
    query.statusChangedAfterMs !== undefined &&
    statusChangedMs < query.statusChangedAfterMs
  ) {
    return false;
  }
  if (
    query.statusChangedBeforeMs !== undefined &&
    statusChangedMs > query.statusChangedBeforeMs
  ) {
    return false;
  }

  const cbc = query.createdByContains;
  if (cbc !== undefined && !ticket.createdBy.includes(cbc)) {
    return false;
  }
  const ubc = query.updatedByContains;
  if (ubc !== undefined && !ticket.updatedBy.includes(ubc)) {
    return false;
  }
  const sbc = query.statusChangedByContains;
  if (sbc !== undefined && !ticket.statusChangedBy.includes(sbc)) {
    return false;
  }

  const titleLower = query.titleContainsLower;
  if (titleLower !== undefined) {
    if (!ticket.title.toLowerCase().includes(titleLower)) {
      return false;
    }
  }

  if (query.githubLinkedOnly === true) {
    const n = ticket.githubIssueNumber;
    if (n === undefined || !Number.isFinite(n)) {
      return false;
    }
  }

  return true;
};
