import { normalizeTicketBranchListFromPayloadValue } from "../lib/normalize-ticket-branches";
import {
  ticketLabelListsEqual,
  ticketLabelsFromPayloadValue,
} from "../lib/ticket-planning-fields";
import type { WorkItemStatus } from "../lib/work-item-status";
import type { TicketRecord } from "../storage/projection";

/**
 * Returns true when two branch name lists are identical (same length and pairwise `===`).
 *
 * @param a - First list.
 * @param b - Second list.
 */
const branchListsEqual = (
  a: readonly string[],
  b: readonly string[],
): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Current title/body/status for an epic or story row (projection slice). */
export type EpicOrStoryUpdateRow = {
  title: string;
  body: string;
  status: WorkItemStatus;
};

/**
 * Removes unchanged title/body/status keys from an epic or story update draft so audit payloads only list real edits.
 *
 * @param cur - Current projection row before applying the draft.
 * @param draft - Payload built from CLI flags (always includes `id`).
 * @returns A new payload containing `id` plus only fields that differ from `cur`.
 */
export const pruneEpicOrStoryUpdatePayloadAgainstRow = (
  cur: EpicOrStoryUpdateRow,
  draft: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { id: draft["id"] };
  if (draft["title"] !== undefined && String(draft["title"]) !== cur.title) {
    out["title"] = draft["title"];
  }
  if (draft["body"] !== undefined && String(draft["body"]) !== cur.body) {
    out["body"] = draft["body"];
  }
  if (draft["status"] !== undefined && draft["status"] !== cur.status) {
    out["status"] = draft["status"];
  }
  return out;
};

/**
 * Removes keys from a ticket update draft when values match the current projection row.
 *
 * @param cur - Current ticket row before applying the draft.
 * @param draft - Payload assembled for `TicketUpdated` (always includes `id`).
 * @returns A new payload containing `id` plus only fields that differ from `cur`.
 */
export const pruneTicketUpdatePayloadAgainstRow = (
  cur: TicketRecord,
  draft: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { id: draft["id"] };

  if (draft["title"] !== undefined && String(draft["title"]) !== cur.title) {
    out["title"] = draft["title"];
  }
  if (draft["body"] !== undefined && String(draft["body"]) !== cur.body) {
    out["body"] = draft["body"];
  }
  if (draft["status"] !== undefined && draft["status"] !== cur.status) {
    out["status"] = draft["status"];
  }

  if (draft["storyId"] !== undefined) {
    const nextStory =
      draft["storyId"] === null ? null : String(draft["storyId"]);
    const curStory = cur.storyId ?? null;
    if (nextStory !== curStory) {
      out["storyId"] = draft["storyId"];
    }
  }

  if (draft["assignee"] !== undefined) {
    const nextAssignee =
      draft["assignee"] === null ? null : String(draft["assignee"]);
    const curAssignee = cur.assignee ?? null;
    if (nextAssignee !== curAssignee) {
      out["assignee"] = draft["assignee"];
    }
  }

  if (draft["branches"] !== undefined) {
    const nextBranches = normalizeTicketBranchListFromPayloadValue(
      draft["branches"],
    );
    if (!branchListsEqual(nextBranches, cur.linkedBranches)) {
      out["branches"] = draft["branches"];
    }
  }

  if (draft["labels"] !== undefined) {
    const parsed = ticketLabelsFromPayloadValue(draft["labels"]);
    const nextLabels = parsed ?? [];
    if (!ticketLabelListsEqual(cur.labels, nextLabels)) {
      out["labels"] = draft["labels"];
    }
  }

  if (draft["priority"] !== undefined) {
    const curP = cur.priority ?? null;
    const nextP = draft["priority"] === null ? null : draft["priority"];
    if (nextP !== curP) {
      out["priority"] = draft["priority"];
    }
  }

  if (draft["size"] !== undefined) {
    const curS = cur.size ?? null;
    const nextS = draft["size"] === null ? null : draft["size"];
    if (nextS !== curS) {
      out["size"] = draft["size"];
    }
  }

  if (draft["estimate"] !== undefined) {
    const curE = cur.estimate ?? null;
    const nextE = draft["estimate"] === null ? null : draft["estimate"];
    if (nextE !== curE) {
      out["estimate"] = draft["estimate"];
    }
  }

  if (draft["startWorkAt"] !== undefined) {
    const curS = cur.startWorkAt ?? null;
    const nextS = draft["startWorkAt"] === null ? null : draft["startWorkAt"];
    if (nextS !== curS) {
      out["startWorkAt"] = draft["startWorkAt"];
    }
  }

  if (draft["targetFinishAt"] !== undefined) {
    const curT = cur.targetFinishAt ?? null;
    const nextT =
      draft["targetFinishAt"] === null ? null : draft["targetFinishAt"];
    if (nextT !== curT) {
      out["targetFinishAt"] = draft["targetFinishAt"];
    }
  }

  return out;
};

/**
 * Returns true when a pruned update payload has no mutations besides `id`.
 *
 * @param payload - Output from {@link pruneEpicOrStoryUpdatePayloadAgainstRow} or {@link pruneTicketUpdatePayloadAgainstRow}.
 */
export const isNoOpUpdatePayload = (
  payload: Record<string, unknown>,
): boolean => Object.keys(payload).length === 1 && payload["id"] !== undefined;
