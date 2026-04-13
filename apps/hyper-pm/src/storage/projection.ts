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
import { parseTicketDependsOnFromPayloadValue } from "../lib/ticket-depends-on";
import {
  readTicketEstimatePatch,
  readTicketIsoInstantPatch,
  readTicketPriorityPatch,
  readTicketSizePatch,
  ticketLabelsFromPayloadValue,
  type TicketPriority,
  type TicketSize,
} from "../lib/ticket-planning-fields";
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
  /** Monotonic display number for this data branch (independent from story/ticket counters). */
  number: number;
  title: string;
  body: string;
  status: WorkItemStatus;
  deleted?: boolean;
} & EntityAudit &
  StatusTransitionAudit;

export type StoryRecord = {
  id: string;
  /** Monotonic display number for this data branch (independent from epic/ticket counters). */
  number: number;
  epicId: string;
  title: string;
  body: string;
  status: WorkItemStatus;
  deleted?: boolean;
} & EntityAudit &
  StatusTransitionAudit;

/** One durable comment on a ticket (from `TicketCommentAdded` replay). */
export type TicketCommentRecord = {
  /** Same as the enclosing event line `id` (ULID). */
  id: string;
  body: string;
  createdAt: string;
  createdBy: string;
};

export type TicketRecord = {
  id: string;
  /** Monotonic display number for this data branch (independent from epic/story counters). */
  number: number;
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
  /** Normalized labels from `TicketCreated` / `TicketUpdated` payloads when non-empty. */
  labels?: string[];
  /** Planning priority when set. */
  priority?: TicketPriority;
  /** Planning size when set. */
  size?: TicketSize;
  /** Non-negative estimate (e.g. story points) when set. */
  estimate?: number;
  /** ISO-8601 instant when work is planned to start. */
  startWorkAt?: string;
  /** ISO-8601 instant for planned completion. */
  targetFinishAt?: string;
  /**
   * Other ticket ids this ticket depends on (prerequisites), from `TicketCreated` /
   * `TicketUpdated` / `GithubInboundUpdate` payloads.
   */
  dependsOn?: string[];
  /** Chronological thread from `TicketCommentAdded` events (replay order). */
  comments?: TicketCommentRecord[];
  deleted?: boolean;
} & EntityAudit &
  StatusTransitionAudit;

export type Projection = {
  epics: Map<string, EpicRecord>;
  stories: Map<string, StoryRecord>;
  tickets: Map<string, TicketRecord>;
  syncCursor?: string;
};

/**
 * Reads an optional strictly positive safe integer from an event payload field.
 *
 * @param payload - Event payload object.
 * @param key - Field name (typically `"number"` on `*Created` events).
 * @returns The integer when present and valid; otherwise `undefined`.
 */
export const readOptionalPositiveIntegerFromPayload = (
  payload: Record<string, unknown>,
  key: string,
): number | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
  const raw = payload[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (!Number.isInteger(raw)) return undefined;
  if (raw < 1 || raw > Number.MAX_SAFE_INTEGER) return undefined;
  return raw;
};

/**
 * Returns the largest `number` among iterable work-item rows (defaults to `0` when empty).
 *
 * @param rows - Epic, story, or ticket rows (may include deleted).
 */
const maxNumberAmongRows = (rows: Iterable<{ number: number }>): number => {
  let m = 0;
  for (const r of rows) {
    if (r.number > m) m = r.number;
  }
  return m;
};

/**
 * Returns the highest epic `number` in the projection (including deleted rows).
 *
 * @param projection - Replayed projection state.
 */
export const maxEpicNumberInProjection = (projection: Projection): number =>
  maxNumberAmongRows(projection.epics.values());

/**
 * Returns the highest story `number` in the projection (including deleted rows).
 *
 * @param projection - Replayed projection state.
 */
export const maxStoryNumberInProjection = (projection: Projection): number =>
  maxNumberAmongRows(projection.stories.values());

/**
 * Returns the highest ticket `number` in the projection (including deleted rows).
 *
 * @param projection - Replayed projection state.
 */
export const maxTicketNumberInProjection = (projection: Projection): number =>
  maxNumberAmongRows(projection.tickets.values());

/**
 * Returns the next epic `number` to assign when appending `EpicCreated`.
 *
 * @param projection - State before the new create is applied.
 */
export const nextEpicNumberForCreate = (projection: Projection): number =>
  maxEpicNumberInProjection(projection) + 1;

/**
 * Returns the next story `number` to assign when appending `StoryCreated`.
 *
 * @param projection - State before the new create is applied.
 */
export const nextStoryNumberForCreate = (projection: Projection): number =>
  maxStoryNumberInProjection(projection) + 1;

/**
 * Returns the next ticket `number` to assign when appending `TicketCreated`.
 *
 * @param projection - State before the new create is applied.
 */
export const nextTicketNumberForCreate = (projection: Projection): number =>
  maxTicketNumberInProjection(projection) + 1;

type CreateEntityKind = "epic" | "story" | "ticket";

/**
 * Resolves `number` for a `*Created` event: explicit payload wins; otherwise `max+1` for that type.
 *
 * @param projection - Current projection before the new row is inserted.
 * @param kind - Which counter namespace to use.
 * @param payload - Parsed create payload.
 */
const resolveWorkItemCreateNumber = (
  projection: Projection,
  kind: CreateEntityKind,
  payload: Record<string, unknown>,
): number => {
  const explicit = readOptionalPositiveIntegerFromPayload(payload, "number");
  if (explicit !== undefined) {
    return explicit;
  }
  return (
    (kind === "epic"
      ? maxEpicNumberInProjection(projection)
      : kind === "story"
        ? maxStoryNumberInProjection(projection)
        : maxTicketNumberInProjection(projection)) + 1
  );
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
 * Applies optional planning fields from a `TicketCreated` payload (invalid values are ignored).
 *
 * @param row - Newly created ticket row.
 * @param payload - Create event payload.
 */
const applyTicketPlanningFieldsFromCreatePayload = (
  row: TicketRecord,
  payload: Record<string, unknown>,
): void => {
  if (Object.prototype.hasOwnProperty.call(payload, "labels")) {
    const v = ticketLabelsFromPayloadValue(payload["labels"]);
    if (v !== undefined && v.length > 0) {
      row.labels = v;
    }
  }
  const pr = readTicketPriorityPatch(payload);
  if (typeof pr === "string") {
    row.priority = pr;
  }
  const sz = readTicketSizePatch(payload);
  if (typeof sz === "string") {
    row.size = sz;
  }
  const est = readTicketEstimatePatch(payload);
  if (typeof est === "number") {
    row.estimate = est;
  }
  const sw = readTicketIsoInstantPatch(payload, "startWorkAt");
  if (typeof sw === "string") {
    row.startWorkAt = sw;
  }
  const tf = readTicketIsoInstantPatch(payload, "targetFinishAt");
  if (typeof tf === "string") {
    row.targetFinishAt = tf;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "dependsOn")) {
    const v = parseTicketDependsOnFromPayloadValue(payload["dependsOn"]);
    if (v !== undefined && v.length > 0) {
      row.dependsOn = v;
    }
  }
};

/**
 * Applies planning field patches from a `TicketUpdated` payload (`null` clears).
 *
 * @param row - Mutable ticket row.
 * @param payload - Update event payload.
 */
const applyTicketPlanningFieldsFromUpdatePayload = (
  row: TicketRecord,
  payload: Record<string, unknown>,
): void => {
  if (Object.prototype.hasOwnProperty.call(payload, "labels")) {
    if (payload["labels"] === null) {
      delete row.labels;
    } else {
      const v = ticketLabelsFromPayloadValue(payload["labels"]);
      if (v !== undefined) {
        if (v.length === 0) {
          delete row.labels;
        } else {
          row.labels = v;
        }
      }
    }
  }
  const pr = readTicketPriorityPatch(payload);
  if (pr === null) {
    delete row.priority;
  } else if (typeof pr === "string") {
    row.priority = pr;
  }
  const sz = readTicketSizePatch(payload);
  if (sz === null) {
    delete row.size;
  } else if (typeof sz === "string") {
    row.size = sz;
  }
  const est = readTicketEstimatePatch(payload);
  if (est === null) {
    delete row.estimate;
  } else if (typeof est === "number") {
    row.estimate = est;
  }
  const sw = readTicketIsoInstantPatch(payload, "startWorkAt");
  if (sw === null) {
    delete row.startWorkAt;
  } else if (typeof sw === "string") {
    row.startWorkAt = sw;
  }
  const tf = readTicketIsoInstantPatch(payload, "targetFinishAt");
  if (tf === null) {
    delete row.targetFinishAt;
  } else if (typeof tf === "string") {
    row.targetFinishAt = tf;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "dependsOn")) {
    if (payload["dependsOn"] === null) {
      delete row.dependsOn;
    } else {
      const v = parseTicketDependsOnFromPayloadValue(payload["dependsOn"]);
      if (v !== undefined) {
        if (v.length === 0) {
          delete row.dependsOn;
        } else {
          row.dependsOn = v;
        }
      }
    }
  }
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
/**
 * Appends a `TicketCommentAdded` comment onto a live ticket and bumps `updatedAt` / `updatedBy`.
 *
 * @param ticket - Non-deleted ticket row (caller must ensure the ticket exists and is active).
 * @param evt - Parsed `TicketCommentAdded` line; `evt.id` becomes the comment id.
 */
const appendTicketCommentFromEvent = (
  ticket: TicketRecord,
  evt: EventLine,
): void => {
  const list = ticket.comments ?? (ticket.comments = []);
  list.push({
    id: evt.id,
    body: String(evt.payload["body"] ?? ""),
    createdAt: evt.ts,
    createdBy: evt.actor,
  });
  applyLastUpdate(ticket, evt);
};

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
        number: resolveWorkItemCreateNumber(projection, "epic", evt.payload),
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
        number: resolveWorkItemCreateNumber(projection, "story", evt.payload),
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
        number: resolveWorkItemCreateNumber(projection, "ticket", evt.payload),
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
      applyTicketPlanningFieldsFromCreatePayload(row, evt.payload);
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
      applyTicketPlanningFieldsFromUpdatePayload(cur, evt.payload);
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
    case "TicketCommentAdded": {
      const ticketId = String(evt.payload["ticketId"] ?? "");
      const ticket = projection.tickets.get(ticketId);
      if (!ticket || ticket.deleted) break;
      appendTicketCommentFromEvent(ticket, evt);
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
        applyTicketPlanningFieldsFromUpdatePayload(ticket, evt.payload);
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
      if (summary.kind === "opened") {
        const statusChanged = applyStatusIfChanged(ticket, evt, "in_progress");
        if (statusChanged) {
          applyLastUpdate(ticket, evt);
        }
      }
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
