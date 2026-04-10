import { eventLineSchema, type EventLine } from "./event-line";

export type EpicRecord = {
  id: string;
  title: string;
  body: string;
  deleted?: boolean;
};

export type StoryRecord = {
  id: string;
  epicId: string;
  title: string;
  body: string;
  deleted?: boolean;
};

export type TicketRecord = {
  id: string;
  storyId: string;
  title: string;
  body: string;
  state: "open" | "closed";
  /** Parsed PR refs from body (REQ-010). */
  linkedPrs: number[];
  /** GitHub issue number when linked via sync. */
  githubIssueNumber?: number;
  deleted?: boolean;
};

export type Projection = {
  epics: Map<string, EpicRecord>;
  stories: Map<string, StoryRecord>;
  tickets: Map<string, TicketRecord>;
  syncCursor?: string;
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
 * Applies a single validated event onto an in-memory projection (last-writer-wins per field).
 *
 * @param projection - Mutable projection state.
 * @param evt - Parsed event line.
 */
export const applyEvent = (projection: Projection, evt: EventLine): void => {
  switch (evt.type) {
    case "EpicCreated": {
      const id = String(evt.payload["id"]);
      projection.epics.set(id, {
        id,
        title: String(evt.payload["title"] ?? ""),
        body: String(evt.payload["body"] ?? ""),
      });
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
      break;
    }
    case "EpicDeleted": {
      const id = String(evt.payload["id"]);
      const cur = projection.epics.get(id);
      if (cur) cur.deleted = true;
      break;
    }
    case "StoryCreated": {
      const id = String(evt.payload["id"]);
      projection.stories.set(id, {
        id,
        epicId: String(evt.payload["epicId"]),
        title: String(evt.payload["title"] ?? ""),
        body: String(evt.payload["body"] ?? ""),
      });
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
      break;
    }
    case "StoryDeleted": {
      const id = String(evt.payload["id"]);
      const cur = projection.stories.get(id);
      if (cur) cur.deleted = true;
      break;
    }
    case "TicketCreated": {
      const id = String(evt.payload["id"]);
      const body = String(evt.payload["body"] ?? "");
      projection.tickets.set(id, {
        id,
        storyId: String(evt.payload["storyId"]),
        title: String(evt.payload["title"] ?? ""),
        body,
        state:
          evt.payload["state"] === "closed" || evt.payload["state"] === "open"
            ? evt.payload["state"]
            : "open",
        linkedPrs: parsePrRefs(body),
      });
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
      if (
        evt.payload["state"] === "open" ||
        evt.payload["state"] === "closed"
      ) {
        cur.state = evt.payload["state"];
      }
      break;
    }
    case "TicketDeleted": {
      const id = String(evt.payload["id"]);
      const cur = projection.tickets.get(id);
      if (cur) cur.deleted = true;
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
        if (
          evt.payload["state"] === "open" ||
          evt.payload["state"] === "closed"
        ) {
          ticket.state = evt.payload["state"];
        }
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
