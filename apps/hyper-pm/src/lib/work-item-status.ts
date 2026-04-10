import { z } from "zod";

/** Default `status` for new epics and stories when the payload omits it. */
export const DEFAULT_EPIC_STORY_CREATE_STATUS = "backlog" as const;

/** Default `status` for new tickets when the payload omits both `status` and legacy `state`. */
export const DEFAULT_TICKET_CREATE_STATUS = "todo" as const;

const statuses = [
  "backlog",
  "todo",
  "in_progress",
  "done",
  "cancelled",
] as const;

/**
 * Zod schema for the shared workflow status enum used by epics, stories, and tickets.
 */
export const workItemStatusSchema = z.enum(statuses);

/**
 * Workflow status for epics, stories, and tickets (distinct from soft-delete).
 */
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;

/**
 * Parses a payload value into a workflow status when it is a valid enum member.
 *
 * @param value - Unknown JSON payload fragment.
 * @returns The status, or `undefined` when missing or invalid.
 */
export const parseWorkItemStatus = (
  value: unknown,
): WorkItemStatus | undefined => {
  const parsed = workItemStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/**
 * Resolves initial epic/story `status` from a create payload (defaults to backlog).
 *
 * @param payload - `EpicCreated` / `StoryCreated` payload.
 */
export const resolveStatusForNewEpicStoryPayload = (
  payload: Record<string, unknown>,
): WorkItemStatus =>
  parseWorkItemStatus(payload["status"]) ?? DEFAULT_EPIC_STORY_CREATE_STATUS;

/**
 * Resolves initial ticket `status` from a create payload, including legacy `state` only.
 *
 * @param payload - `TicketCreated` payload.
 */
export const resolveStatusForNewTicketPayload = (
  payload: Record<string, unknown>,
): WorkItemStatus => {
  const fromStatus = parseWorkItemStatus(payload["status"]);
  if (fromStatus !== undefined) return fromStatus;
  if (payload["state"] === "closed") return "done";
  return DEFAULT_TICKET_CREATE_STATUS;
};

/**
 * Derives a ticket `status` patch from a `TicketUpdated` payload (`status` or legacy `state`).
 *
 * @param payload - `TicketUpdated` payload.
 * @returns The next status when the payload requests a workflow change; otherwise `undefined`.
 */
export const resolveTicketStatusFromUpdatePayload = (
  payload: Record<string, unknown>,
): WorkItemStatus | undefined => {
  const fromStatus = parseWorkItemStatus(payload["status"]);
  if (fromStatus !== undefined) return fromStatus;
  if (payload["state"] === "closed") return "done";
  if (payload["state"] === "open") return "todo";
  return undefined;
};

/**
 * Maps hyper-pm workflow status to GitHub Issues API `state`.
 *
 * @param status - Ticket workflow status.
 * @returns Issue open/closed flag for `issues.create` / `issues.update`.
 */
export const statusToGithubIssueState = (
  status: WorkItemStatus,
): "open" | "closed" =>
  status === "done" || status === "cancelled" ? "closed" : "open";

/**
 * Computes the ticket status to apply after observing a GitHub issue open/closed flag,
 * without clobbering non-terminal work when the issue stays open.
 *
 * @param params - GitHub issue API state and the current projected ticket status.
 * @returns The status that should be stored after inbound sync.
 */
export const resolveTicketInboundStatus = (params: {
  issueState: "open" | "closed";
  currentStatus: WorkItemStatus;
}): WorkItemStatus => {
  if (params.issueState === "closed") return "done";
  if (params.currentStatus === "done" || params.currentStatus === "cancelled") {
    return "todo";
  }
  return params.currentStatus;
};
