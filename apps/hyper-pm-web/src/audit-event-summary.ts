const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const pickStr = (
  p: Record<string, unknown>,
  key: string,
): string | undefined => {
  const v = p[key];
  return typeof v === "string" ? v : undefined;
};

const quoteStatus = (s: string): string => JSON.stringify(s);

const normalizeStrList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
};

const branchesPhrase = (branches: string[]): string => {
  const usable = branches.filter((b) => b.length > 0 && b.length <= 40);
  if (usable.length === 0 || usable.length > 3) {
    return "updated linked branches";
  }
  return `updated linked branches (${usable.join(", ")})`;
};

/**
 * Collects short aspect phrases for epic/story/ticket update payloads (web timeline).
 *
 * @param kind - Work item kind.
 * @param payload - Event payload (excluding envelope).
 */
const workItemUpdateAspects = (
  kind: "epic" | "story" | "ticket",
  payload: Record<string, unknown>,
): string[] => {
  const aspects: string[] = [];
  const idOnly = Object.keys(payload).filter((k) => k !== "id");
  if (idOnly.length === 0) {
    return [];
  }
  if (payload["status"] !== undefined) {
    aspects.push(`Status set to ${quoteStatus(String(payload["status"]))}.`);
  }
  if (kind === "ticket" && payload["assignee"] !== undefined) {
    const a = payload["assignee"];
    if (a === null) {
      aspects.push("Assignee cleared.");
    } else if (typeof a === "string" && a.length > 0) {
      aspects.push(`Assignee set to ${quoteStatus(a)}.`);
    }
  }
  if (kind === "ticket" && payload["storyId"] !== undefined) {
    aspects.push(`Story link: ${String(payload["storyId"])}.`);
  }
  if (kind === "ticket" && payload["branches"] !== undefined) {
    aspects.push(branchesPhrase(normalizeStrList(payload["branches"])));
  }
  if (kind === "ticket" && payload["labels"] !== undefined) {
    if (payload["labels"] === null) {
      aspects.push("Labels cleared.");
    } else {
      const lb = normalizeStrList(payload["labels"]);
      aspects.push(
        lb.length > 0 ? `Labels: ${lb.join(", ")}.` : "Labels cleared.",
      );
    }
  }
  if (kind === "ticket" && payload["dependsOn"] !== undefined) {
    if (payload["dependsOn"] === null) {
      aspects.push("Ticket dependencies cleared.");
    } else {
      const d = normalizeStrList(payload["dependsOn"]);
      aspects.push(
        d.length > 0
          ? `Depends on: ${d.join(", ")}.`
          : "Ticket dependencies cleared.",
      );
    }
  }
  if (kind === "ticket" && payload["priority"] !== undefined) {
    aspects.push(
      payload["priority"] === null
        ? "Priority cleared."
        : `Priority: ${quoteStatus(String(payload["priority"]))}.`,
    );
  }
  if (kind === "ticket" && payload["size"] !== undefined) {
    aspects.push(
      payload["size"] === null
        ? "Size cleared."
        : `Size: ${quoteStatus(String(payload["size"]))}.`,
    );
  }
  if (kind === "ticket" && payload["estimate"] !== undefined) {
    aspects.push(
      payload["estimate"] === null
        ? "Estimate cleared."
        : `Estimate: ${String(payload["estimate"])}.`,
    );
  }
  if (payload["title"] !== undefined) {
    aspects.push("Title changed.");
  }
  if (payload["body"] !== undefined) {
    aspects.push("Description updated.");
  }
  return aspects;
};

const EVENT_TITLE: Record<string, string> = {
  EpicCreated: "Epic created",
  EpicUpdated: "Epic updated",
  EpicDeleted: "Epic deleted",
  StoryCreated: "Story created",
  StoryUpdated: "Story updated",
  StoryDeleted: "Story deleted",
  TicketCreated: "Ticket created",
  TicketUpdated: "Ticket updated",
  TicketDeleted: "Ticket deleted",
  TicketCommentAdded: "Comment added",
  SyncCursor: "Sync cursor",
  GithubInboundUpdate: "GitHub inbound update",
  GithubIssueLinked: "GitHub issue linked",
  GithubPrActivity: "Pull request activity",
};

/**
 * Human-readable title and detail lines for one audit JSON event (browser timeline).
 *
 * @param evt - Parsed audit event object from `hyper-pm audit --format json`.
 * @returns Title and zero or more detail lines (safe plain text, no HTML).
 */
export const summarizeAuditEventForWeb = (
  evt: unknown,
): { title: string; detailLines: string[] } => {
  if (!isRecord(evt)) {
    return { title: "Unknown event", detailLines: [] };
  }
  const type = typeof evt["type"] === "string" ? evt["type"] : "";
  const payload = isRecord(evt["payload"]) ? evt["payload"] : {};

  const title = EVENT_TITLE[type] ?? (type.length > 0 ? type : "Unknown event");
  const details: string[] = [];

  switch (type) {
    case "EpicUpdated":
      details.push(...workItemUpdateAspects("epic", payload));
      break;
    case "StoryUpdated":
      details.push(...workItemUpdateAspects("story", payload));
      break;
    case "TicketUpdated":
      details.push(...workItemUpdateAspects("ticket", payload));
      break;
    case "TicketCommentAdded": {
      const body = pickStr(payload, "body");
      if (body !== undefined && body.trim().length > 0) {
        const one = body.trim().replace(/\s+/g, " ");
        details.push(
          one.length > 200 ? `${one.slice(0, 197).trimEnd()}…` : one,
        );
      }
      break;
    }
    case "GithubPrActivity": {
      const pr = payload["prNumber"];
      const kind = pickStr(payload, "kind");
      const prn = typeof pr === "number" ? String(pr) : String(pr ?? "");
      if (prn || kind) {
        details.push(
          [prn ? `PR #${prn}` : "", kind ?? ""].filter(Boolean).join(" · "),
        );
      }
      break;
    }
    case "GithubIssueLinked": {
      const n = payload["issueNumber"];
      if (typeof n === "number") {
        details.push(`Issue #${n}`);
      }
      break;
    }
    case "GithubInboundUpdate": {
      const parts: string[] = [];
      if (payload["title"] !== undefined) parts.push("title");
      if (payload["body"] !== undefined) parts.push("description");
      if (payload["status"] !== undefined) parts.push("status");
      if (parts.length > 0) {
        details.push(`Fields: ${parts.join(", ")}.`);
      }
      break;
    }
    case "SyncCursor": {
      const c = pickStr(payload, "cursor");
      if (c !== undefined) details.push(`Cursor: ${c}`);
      break;
    }
    default:
      break;
  }

  return { title, detailLines: details };
};
