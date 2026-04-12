import { normalizeGithubLogin } from "../lib/github-assignee";
import { normalizeTicketBranchListFromPayloadValue } from "../lib/normalize-ticket-branches";
import {
  GITHUB_PR_ACTIVITY_RECENT_CAP,
  parseGithubPrActivityPayload,
  type TicketPrActivitySummary,
} from "../lib/github-pr-activity";
import {
  parseWorkItemStatus,
  resolveStatusForNewEpicStoryPayload,
  resolveStatusForNewTicketPayload,
  resolveTicketInboundStatus,
  resolveTicketStatusFromUpdatePayload,
  type WorkItemStatus,
} from "../lib/work-item-status";
import { eventLineSchema, type EventLine } from "./event-line";

/** Audit fields copied from durable events (`ts` / `actor`) for CLI read output. */
type EntityAudit = {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

/** Fields for last workflow transition (distinct from `updatedAt`). */
type StatusTransitionAudit = {
  statusChangedAt: string;
  statusChangedBy: string;
};

export type EpicRecord = {
  id: string;
  title: string;
  body: string;
  status: WorkItemStatus;
  deleted?: boolean;
} & EntityAudit &
  StatusTransitionAudit;

export type StoryRecord = {
  id: string;
  epicId: string;
  title: string;
  body: string;
  status: WorkItemStatus;
  deleted?: boolean;
} & EntityAudit &
  StatusTransitionAudit;

export type TicketRecord = {
  id: string;
  /** Present when the ticket belongs to a story; `null` when unlinked / never assigned. */
  storyId: string | null;
  title: string;
  body: string;
  status: WorkItemStatus;
  /** Parsed PR refs from body (REQ-010). */
  linkedPrs: number[];
  /** Git branch names linked to this ticket (from `TicketCreated` / `TicketUpdated` payloads). */
  linkedBranches: string[];
  /** GitHub issue number when linked via sync. */
  githubIssueNumber?: number;
  /** Recent PR sub-events from `GithubPrActivity` replay (capped). */
  prActivityRecent?: TicketPrActivitySummary[];
  /** GitHub login (normalized), when the ticket has an assignee. */
  assignee?: string;
  deleted?: boolean;
} & EntityAudit &
  StatusTransitionAudit;

export type Projection = {
  epics: Map<string, EpicRecord>;
  stories: Map<string, StoryRecord>;
  tickets: Map<string, TicketRecord>;
  syncCursor?: string;
};

type WorkflowRow = {
  status: WorkItemStatus;
  statusChangedAt: string;
  statusChangedBy: string;
};

const emptyProjection = (): Projection => ({
  epics: new Map(),
  stories: new Map(),
  tickets: new Map(),
});

const parsePrRefs = (body: string): number[] => {
  const out = new Set<number>();
  const re = /\b(?:Closes|Refs|Fixes)\s+#(\d+)\b/gi;
  let m: RegExpExecArray | null = re.exec(body);
  while (m !== null) {
    out.add(Number(m[1]));
    m = re.exec(body);
  }
  return [...out];
};

/**
 * Applies optional `assignee` from a ticket event payload (`TicketCreated`, `TicketUpdated`, `GithubInboundUpdate`).
 * Missing key leaves the field unchanged; `null` clears; non-empty string sets a normalized login; whitespace-only clears.
 *
 * @param row - Mutable ticket row.
 * @param payload - Event payload possibly containing `assignee`.
 */
const applyTicketAssigneeFromPayload = (
  row: TicketRecord,
  payload: Record<string, unknown>,
): void => {
  if (!Object.prototype.hasOwnProperty.call(payload, "assignee")) return;
  const v = payload["assignee"];
  if (v === null) {
    delete row.assignee;
    return;
  }
  if (typeof v !== "string") return;
  const n = normalizeGithubLogin(v);
  if (n === "") delete row.assignee;
  else row.assignee = n;
};

/**
 * Resolves `storyId` for a new ticket from a `TicketCreated` payload.
 *
 * @param payload - Event payload possibly containing `storyId`.
 * @returns A non-empty trimmed story id, or `null` when absent, cleared, or invalid.
 */
const storyIdFromTicketCreatedPayload = (
  payload: Record<string, unknown>,
): string | null => {
  if (!Object.prototype.hasOwnProperty.call(payload, "storyId")) {
    return null;
  }
  const v = payload["storyId"];
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/**
 * Applies optional `storyId` from a `TicketUpdated` payload.
 * Missing key leaves the field unchanged; `null` or empty string clears to no story; non-string values are ignored.
 *
 * @param row - Mutable ticket row.
 * @param payload - Event payload possibly containing `storyId`.
 */
const applyTicketStoryIdFromPayload = (
  row: TicketRecord,
  payload: Record<string, unknown>,
): void => {
  if (!Object.prototype.hasOwnProperty.call(payload, "storyId")) return;
  const v = payload["storyId"];
  if (v === null) {
    row.storyId = null;
    return;
  }
  if (typeof v !== "string") return;
  const t = v.trim();
  row.storyId = t === "" ? null : t;
};

/**
 * Resolves `linkedBranches` for a new ticket from optional `branches` on `TicketCreated`.
 *
 * @param payload - Create event payload.
 * @returns Normalized branch list; empty when the key is absent or not an array.
 */
const linkedBranchesFromTicketCreatedPayload = (
  payload: Record<string, unknown>,
): string[] => {
  if (!Object.prototype.hasOwnProperty.call(payload, "branches")) {
    return [];
  }
  return normalizeTicketBranchListFromPayloadValue(payload["branches"]);
};

/**
 * Replaces `linkedBranches` when `TicketUpdated` includes a `branches` array; ignores invalid shapes.
 *
 * @param row - Mutable ticket row.
 * @param payload - Update event payload.
 */
const applyTicketBranchesFromUpdatePayload = (
  row: TicketRecord,
  payload: Record<string, unknown>,
): void => {
  if (!Object.prototype.hasOwnProperty.call(payload, "branches")) return;
  const v = payload["branches"];
  if (!Array.isArray(v)) return;
  row.linkedBranches = normalizeTicketBranchListFromPayloadValue(v);
};

/**
 * Sets create and last-update audit from a create event line.
 *
 * @param row - Mutable record that will receive `created*` and initial `updated*`.
 * @param evt - Parsed event (uses `ts` and `actor`).
 */
const applyCreatedAudit = (row: EntityAudit, evt: EventLine): void => {
  row.createdAt = evt.ts;
  row.createdBy = evt.actor;
  row.updatedAt = evt.ts;
  row.updatedBy = evt.actor;
};

/**
 * Updates last-change audit from an event line.
 *
 * @param row - Mutable record with `updatedAt` / `updatedBy`.
 * @param evt - Parsed event (uses `ts` and `actor`).
 */
const applyLastUpdate = (row: EntityAudit, evt: EventLine): void => {
  row.updatedAt = evt.ts;
  row.updatedBy = evt.actor;
};

/**
 * Assigns a new workflow status when it differs and records who changed it.
 *
 * @param row - Epic, story, or ticket row with `status` and `statusChanged*`.
 * @param evt - Source event for `ts` and `actor`.
 * @param nextStatus - Desired status after this event.
 * @returns `true` when the status value changed.
 */
const applyStatusIfChanged = (
  row: WorkflowRow,
  evt: EventLine,
  nextStatus: WorkItemStatus,
): boolean => {
  if (row.status === nextStatus) return false;
  row.status = nextStatus;
  row.statusChangedAt = evt.ts;
  row.statusChangedBy = evt.actor;
  return true;
};

/**
 * Resolves the next ticket status from a `GithubInboundUpdate` payload (new `status` or legacy `state`).
 *
 * @param ticket - Current ticket row before applying the event.
 * @param payload - Inbound sync payload.
 * @returns The status to apply, or `undefined` when the payload carries no workflow signal.
 */
const resolveInboundTicketStatusFromPayload = (
  ticket: TicketRecord,
  payload: Record<string, unknown>,
): WorkItemStatus | undefined => {
  const explicit = parseWorkItemStatus(payload["status"]);
  if (explicit !== undefined) return explicit;
  const legacySt = payload["state"];
  if (legacySt === "open" || legacySt === "closed") {
    return resolveTicketInboundStatus({
      issueState: legacySt,
      currentStatus: ticket.status,
    });
  }
  return undefined;
};

/**
 * Applies a single validated event onto an in-memory projection (last-writer-wins per field).
 *
 * @param projection - Mutable projection state.
 * @param evt - Parsed event line.
 */
export const applyEvent = (projection: Projection, evt: EventLine): void => {
  switch (evt.type) {
    case "EpicCreated": {
      const id = String(evt.payload["id"]);
      const status = resolveStatusForNewEpicStoryPayload(evt.payload);
      const row: EpicRecord = {
        id,
        title: String(evt.payload["title"] ?? ""),
        body: String(evt.payload["body"] ?? ""),
        status,
        statusChangedAt: evt.ts,
        statusChangedBy: evt.actor,
        createdAt: "",
        createdBy: "",
        updatedAt: "",
        updatedBy: "",
      };
      applyCreatedAudit(row, evt);
      projection.epics.set(id, row);
      break;
    }
    case "EpicUpdated": {
      const id = String(evt.payload["id"]);
      const cur = projection.epics.get(id);
      if (!cur) break;
      if (evt.payload["title"] !== undefined) {
        cur.title = String(evt.payload["title"]);
      }
      if (evt.payload["body"] !== undefined) {
        cur.body = String(evt.payload["body"]);
      }
      const nextStatus = parseWorkItemStatus(evt.payload["status"]);
      if (nextStatus !== undefined) {
        applyStatusIfChanged(cur, evt, nextStatus);
      }
      applyLastUpdate(cur, evt);
      break;
    }
    case "EpicDeleted": {
      const id = String(evt.payload["id"]);
      const cur = projection.epics.get(id);
      if (cur) {
        cur.deleted = true;
        applyLastUpdate(cur, evt);
      }
      break;
    }
    case "StoryCreated": {
      const id = String(evt.payload["id"]);
      const status = resolveStatusForNewEpicStoryPayload(evt.payload);
      const row: StoryRecord = {
        id,
        epicId: String(evt.payload["epicId"]),
        title: String(evt.payload["title"] ?? ""),
        body: String(evt.payload["body"] ?? ""),
        status,
        statusChangedAt: evt.ts,
        statusChangedBy: evt.actor,
        createdAt: "",
        createdBy: "",
        updatedAt: "",
        updatedBy: "",
      };
      applyCreatedAudit(row, evt);
      projection.stories.set(id, row);
      break;
    }
    case "StoryUpdated": {
      const id = String(evt.payload["id"]);
      const cur = projection.stories.get(id);
      if (!cur) break;
      if (evt.payload["title"] !== undefined) {
        cur.title = String(evt.payload["title"]);
      }
      if (evt.payload["body"] !== undefined) {
        cur.body = String(evt.payload["body"]);
      }
      const nextStatus = parseWorkItemStatus(evt.payload["status"]);
      if (nextStatus !== undefined) {
        applyStatusIfChanged(cur, evt, nextStatus);
      }
      applyLastUpdate(cur, evt);
      break;
    }
    case "StoryDeleted": {
      const id = String(evt.payload["id"]);
      const cur = projection.stories.get(id);
      if (cur) {
        cur.deleted = true;
        applyLastUpdate(cur, evt);
      }
      break;
    }
    case "TicketCreated": {
      const id = String(evt.payload["id"]);
      const body = String(evt.payload["body"] ?? "");
      const status = resolveStatusForNewTicketPayload(evt.payload);
      const row: TicketRecord = {
        id,
        storyId: storyIdFromTicketCreatedPayload(evt.payload),
        title: String(evt.payload["title"] ?? ""),
        body,
        status,
        statusChangedAt: evt.ts,
        statusChangedBy: evt.actor,
        linkedPrs: parsePrRefs(body),
        linkedBranches: linkedBranchesFromTicketCreatedPayload(evt.payload),
        prActivityRecent: [],
        createdAt: "",
        createdBy: "",
        updatedAt: "",
        updatedBy: "",
      };
      applyCreatedAudit(row, evt);
      applyTicketAssigneeFromPayload(row, evt.payload);
      projection.tickets.set(id, row);
      break;
    }
    case "TicketUpdated": {
      const id = String(evt.payload["id"]);
      const cur = projection.tickets.get(id);
      if (!cur) break;
      if (evt.payload["title"] !== undefined) {
        cur.title = String(evt.payload["title"]);
      }
      if (evt.payload["body"] !== undefined) {
        cur.body = String(evt.payload["body"]);
        cur.linkedPrs = parsePrRefs(cur.body);
      }
      const nextStatus = resolveTicketStatusFromUpdatePayload(evt.payload);
      if (nextStatus !== undefined) {
        applyStatusIfChanged(cur, evt, nextStatus);
      }
      applyTicketAssigneeFromPayload(cur, evt.payload);
      applyTicketStoryIdFromPayload(cur, evt.payload);
      applyTicketBranchesFromUpdatePayload(cur, evt.payload);
      applyLastUpdate(cur, evt);
      break;
    }
    case "TicketDeleted": {
      const id = String(evt.payload["id"]);
      const cur = projection.tickets.get(id);
      if (cur) {
        cur.deleted = true;
        applyLastUpdate(cur, evt);
      }
      break;
    }
    case "SyncCursor": {
      projection.syncCursor = String(evt.payload["cursor"] ?? "");
      break;
    }
    case "GithubIssueLinked": {
      const ticketId = String(evt.payload["ticketId"]);
      const num = Number(evt.payload["issueNumber"]);
      const ticket = projection.tickets.get(ticketId);
      if (ticket && Number.isFinite(num)) {
        ticket.githubIssueNumber = num;
        applyLastUpdate(ticket, evt);
      }
      break;
    }
    case "GithubInboundUpdate": {
      const entity = String(evt.payload["entity"]);
      const entityId = String(evt.payload["entityId"]);
      if (entity === "ticket") {
        const ticket = projection.tickets.get(entityId);
        if (!ticket) break;
        if (evt.payload["title"] !== undefined) {
          ticket.title = String(evt.payload["title"]);
        }
        if (evt.payload["body"] !== undefined) {
          ticket.body = String(evt.payload["body"]);
          ticket.linkedPrs = parsePrRefs(ticket.body);
        }
        const inboundStatus = resolveInboundTicketStatusFromPayload(
          ticket,
          evt.payload,
        );
        if (inboundStatus !== undefined) {
          applyStatusIfChanged(ticket, evt, inboundStatus);
        }
        applyTicketAssigneeFromPayload(ticket, evt.payload);
        applyLastUpdate(ticket, evt);
      }
      break;
    }
    case "GithubPrActivity": {
      const summary = parseGithubPrActivityPayload(evt.payload);
      if (!summary) break;
      const ticket = projection.tickets.get(
        String(evt.payload["ticketId"] ?? ""),
      );
      if (!ticket || ticket.deleted) break;
      const list = ticket.prActivityRecent ?? (ticket.prActivityRecent = []);
      list.push(summary);
      if (list.length > GITHUB_PR_ACTIVITY_RECENT_CAP) {
        ticket.prActivityRecent = list.slice(-GITHUB_PR_ACTIVITY_RECENT_CAP);
      }
      break;
    }
    default:
      break;
  }
};

/**
 * Replays newline-delimited JSON lines into a deterministic projection.
 *
 * @param lines - Raw JSONL payload lines (may be unsorted; caller sorts files).
 */
export const replayEvents = (lines: string[]): Projection => {
  const proj = emptyProjection();
  const events: EventLine[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const json: unknown = JSON.parse(trimmed);
    events.push(eventLineSchema.parse(json));
  }
  events.sort((a, b) => {
    const t = a.ts.localeCompare(b.ts);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
  for (const e of events) {
    applyEvent(proj, e);
  }
  return proj;
};
