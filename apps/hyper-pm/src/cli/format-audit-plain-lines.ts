import type { EventLine } from "../storage/event-line";

/** Allowed values for `audit --text-style`. */
export const AUDIT_TEXT_STYLES = ["tsv", "plain", "plain-links"] as const;

/** CLI `--text-style` for the `audit` command. */
export type AuditTextStyle = (typeof AUDIT_TEXT_STYLES)[number];

const MAX_BRANCH_NAMES_TO_LIST = 3;

const MAX_SINGLE_BRANCH_NAME_LEN = 40;

/**
 * Parses and validates `audit --text-style`.
 *
 * @param raw - Raw flag value (undefined when omitted).
 * @returns A valid style, or `undefined` when invalid.
 */
export const parseAuditTextStyle = (
  raw: string | undefined,
): AuditTextStyle | undefined => {
  if (raw === undefined || raw === "") {
    return "tsv";
  }
  return (AUDIT_TEXT_STYLES as readonly string[]).includes(raw)
    ? (raw as AuditTextStyle)
    : undefined;
};

/**
 * Builds the canonical GitHub web URL for an issue by number.
 *
 * @param owner - Repository owner slug.
 * @param repo - Repository name slug.
 * @param issueNumber - GitHub issue number.
 */
export const githubIssueHtmlUrl = (
  owner: string,
  repo: string,
  issueNumber: number,
): string =>
  `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;

/**
 * Builds the canonical GitHub web URL for a pull request by number.
 *
 * @param owner - Repository owner slug.
 * @param repo - Repository name slug.
 * @param prNumber - GitHub pull request number.
 */
export const githubPullHtmlUrl = (
  owner: string,
  repo: string,
  prNumber: number,
): string =>
  `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull/${prNumber}`;

const pickStr = (
  p: Record<string, unknown>,
  key: string,
): string | undefined => {
  const v = p[key];
  return typeof v === "string" ? v : undefined;
};

const pickNum = (
  p: Record<string, unknown>,
  key: string,
): number | undefined => {
  const v = p[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
};

const quoteStatus = (s: string): string => JSON.stringify(s);

const branchesPhrase = (branches: string[]): string => {
  const usable = branches.filter(
    (b) => b.length > 0 && b.length <= MAX_SINGLE_BRANCH_NAME_LEN,
  );
  if (usable.length === 0 || usable.length > MAX_BRANCH_NAMES_TO_LIST) {
    return "updated linked branches";
  }
  return `updated linked branches (${usable.join(", ")})`;
};

const normalizeBranchList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
};

/**
 * Collects human-readable aspect phrases for epic/story/ticket update payloads.
 *
 * @param kind - Work item kind for phrasing.
 * @param payload - Event payload (excluding event envelope).
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
    aspects.push(
      `changed the status of the ${kind} to ${quoteStatus(String(payload["status"]))}`,
    );
  }
  if (kind === "ticket" && payload["assignee"] !== undefined) {
    const a = payload["assignee"];
    if (a === null) {
      aspects.push("cleared the assignee");
    } else if (typeof a === "string" && a.length > 0) {
      aspects.push(`set the assignee to ${quoteStatus(a)}`);
    }
  }
  if (kind === "ticket" && payload["storyId"] !== undefined) {
    aspects.push(`moved the ticket to story ${String(payload["storyId"])}`);
  }
  if (kind === "ticket" && payload["branches"] !== undefined) {
    aspects.push(branchesPhrase(normalizeBranchList(payload["branches"])));
  }
  if (kind === "ticket" && payload["labels"] !== undefined) {
    if (payload["labels"] === null) {
      aspects.push("cleared labels");
    } else {
      const lb = normalizeBranchList(payload["labels"]);
      if (lb.length > 0) {
        aspects.push(`set labels to (${lb.join(", ")})`);
      } else {
        aspects.push("cleared labels");
      }
    }
  }
  if (kind === "ticket" && payload["priority"] !== undefined) {
    if (payload["priority"] === null) {
      aspects.push("cleared priority");
    } else {
      aspects.push(
        `set priority to ${quoteStatus(String(payload["priority"]))}`,
      );
    }
  }
  if (kind === "ticket" && payload["size"] !== undefined) {
    if (payload["size"] === null) {
      aspects.push("cleared size");
    } else {
      aspects.push(`set size to ${quoteStatus(String(payload["size"]))}`);
    }
  }
  if (kind === "ticket" && payload["estimate"] !== undefined) {
    if (payload["estimate"] === null) {
      aspects.push("cleared estimate");
    } else {
      aspects.push(`set estimate to ${String(payload["estimate"])}`);
    }
  }
  if (kind === "ticket" && payload["startWorkAt"] !== undefined) {
    if (payload["startWorkAt"] === null) {
      aspects.push("cleared start work date");
    } else {
      aspects.push("updated start work date");
    }
  }
  if (kind === "ticket" && payload["targetFinishAt"] !== undefined) {
    if (payload["targetFinishAt"] === null) {
      aspects.push("cleared target finish date");
    } else {
      aspects.push("updated target finish date");
    }
  }
  if (payload["title"] !== undefined) {
    aspects.push("changed the title");
  }
  if (payload["body"] !== undefined) {
    aspects.push("updated the description");
  }
  return aspects;
};

/**
 * Builds link-oriented metadata for `plain-links` output (no large text fields).
 *
 * @param evt - Parsed event line.
 * @param githubRepo - Optional `owner/repo` for derived HTML URLs.
 */
export const buildAuditLinkMetadata = (
  evt: EventLine,
  githubRepo?: { owner: string; repo: string },
): Record<string, unknown> => {
  const p = evt.payload;
  const meta: Record<string, unknown> = { type: evt.type, eventId: evt.id };
  const { owner, repo } = githubRepo ?? {};

  switch (evt.type) {
    case "EpicCreated":
    case "EpicUpdated":
    case "EpicDeleted": {
      const id = pickStr(p, "id");
      if (id !== undefined) meta["epicId"] = id;
      break;
    }
    case "StoryCreated":
    case "StoryUpdated":
    case "StoryDeleted": {
      const id = pickStr(p, "id");
      const epicId = pickStr(p, "epicId");
      if (id !== undefined) meta["storyId"] = id;
      if (epicId !== undefined) meta["epicId"] = epicId;
      break;
    }
    case "TicketCreated":
    case "TicketUpdated":
    case "TicketDeleted": {
      const id = pickStr(p, "id");
      if (id !== undefined) meta["ticketId"] = id;
      const sid = pickStr(p, "storyId");
      if (sid !== undefined) meta["storyId"] = sid;
      break;
    }
    case "TicketCommentAdded": {
      const ticketId = pickStr(p, "ticketId");
      if (ticketId !== undefined) meta["ticketId"] = ticketId;
      meta["commentId"] = evt.id;
      break;
    }
    case "SyncCursor": {
      const cursor = pickStr(p, "cursor");
      if (cursor !== undefined) meta["cursor"] = cursor;
      break;
    }
    case "GithubIssueLinked": {
      const ticketId = pickStr(p, "ticketId");
      const n = pickNum(p, "issueNumber");
      if (ticketId !== undefined) meta["ticketId"] = ticketId;
      if (n !== undefined) {
        meta["issueNumber"] = n;
        if (owner !== undefined && repo !== undefined) {
          meta["issueHtmlUrl"] = githubIssueHtmlUrl(owner, repo, n);
        }
      }
      break;
    }
    case "GithubInboundUpdate": {
      const entityId = pickStr(p, "entityId");
      if (entityId !== undefined) meta["ticketId"] = entityId;
      if (p["title"] !== undefined) meta["titleChanged"] = true;
      if (p["body"] !== undefined) meta["descriptionChanged"] = true;
      if (p["status"] !== undefined) meta["status"] = String(p["status"]);
      if (p["assignee"] !== undefined) meta["assignee"] = p["assignee"];
      if (p["labels"] !== undefined) meta["labels"] = p["labels"];
      if (p["priority"] !== undefined) meta["priority"] = p["priority"];
      if (p["size"] !== undefined) meta["size"] = p["size"];
      if (p["estimate"] !== undefined) meta["estimate"] = p["estimate"];
      if (p["startWorkAt"] !== undefined)
        meta["startWorkAt"] = p["startWorkAt"];
      if (p["targetFinishAt"] !== undefined) {
        meta["targetFinishAt"] = p["targetFinishAt"];
      }
      break;
    }
    case "GithubPrActivity": {
      const ticketId = pickStr(p, "ticketId");
      const pr = pickNum(p, "prNumber");
      const kind = pickStr(p, "kind");
      const url = pickStr(p, "url");
      if (ticketId !== undefined) meta["ticketId"] = ticketId;
      if (pr !== undefined) {
        meta["prNumber"] = pr;
        if (owner !== undefined && repo !== undefined) {
          meta["pullHtmlUrl"] = githubPullHtmlUrl(owner, repo, pr);
        }
      }
      if (kind !== undefined) meta["kind"] = kind;
      if (url !== undefined) meta["url"] = url;
      const sourceId = pickStr(p, "sourceId");
      if (sourceId !== undefined) meta["sourceId"] = sourceId;
      break;
    }
  }
  return meta;
};

const sentencePrefix = (evt: EventLine): string => `${evt.ts}: ${evt.actor}`;

const formatEpicStoryTicketCreated = (
  evt: EventLine,
  entity: "epic" | "story" | "ticket",
): string => {
  const p = evt.payload;
  const id = String(p["id"] ?? "");
  const parts: string[] = [
    `${sentencePrefix(evt)} created the ${entity} ${id}`,
  ];
  if (p["status"] !== undefined) {
    parts.push(`with status ${quoteStatus(String(p["status"]))}`);
  }
  if (entity === "story" && p["epicId"] !== undefined) {
    parts.push(`under epic ${String(p["epicId"])}`);
  }
  if (entity === "ticket") {
    if (p["storyId"] !== undefined) {
      parts.push(`linked to story ${String(p["storyId"])}`);
    }
    if (p["assignee"] !== undefined && typeof p["assignee"] === "string") {
      parts.push(`assigned to ${quoteStatus(p["assignee"])}`);
    }
    if (p["branches"] !== undefined) {
      const b = normalizeBranchList(p["branches"]);
      if (b.length > 0 && b.length <= MAX_BRANCH_NAMES_TO_LIST) {
        parts.push(`with linked branches (${b.join(", ")})`);
      } else if (b.length > MAX_BRANCH_NAMES_TO_LIST) {
        parts.push("with linked branches");
      }
    }
    if (p["labels"] !== undefined) {
      const lb = normalizeBranchList(p["labels"]);
      if (lb.length > 0 && lb.length <= MAX_BRANCH_NAMES_TO_LIST) {
        parts.push(`with labels (${lb.join(", ")})`);
      } else if (lb.length > MAX_BRANCH_NAMES_TO_LIST) {
        parts.push("with labels");
      }
    }
    if (p["priority"] !== undefined) {
      parts.push(`with priority ${quoteStatus(String(p["priority"]))}`);
    }
    if (p["size"] !== undefined) {
      parts.push(`with size ${quoteStatus(String(p["size"]))}`);
    }
    if (p["estimate"] !== undefined) {
      parts.push(`with estimate ${String(p["estimate"])}`);
    }
    if (p["startWorkAt"] !== undefined) {
      parts.push("with a start work date");
    }
    if (p["targetFinishAt"] !== undefined) {
      parts.push("with a target finish date");
    }
  }
  return parts.join(" ");
};

const formatDeleted = (
  evt: EventLine,
  entity: "epic" | "story" | "ticket",
): string => {
  const id = String(evt.payload["id"] ?? "");
  return `${sentencePrefix(evt)} deleted the ${entity} ${id}`;
};

const formatWorkItemUpdated = (
  evt: EventLine,
  kind: "epic" | "story" | "ticket",
): string => {
  const p = evt.payload;
  const id = String(p["id"] ?? "");
  const aspects = workItemUpdateAspects(kind, p);
  if (aspects.length === 0) {
    return `${sentencePrefix(evt)} updated the ${kind} ${id}`;
  }
  return `${sentencePrefix(evt)} updated the ${kind} ${id}: ${aspects.join("; ")}`;
};

/**
 * Renders a single-line human description of one durable event.
 *
 * @param evt - Parsed event line.
 */
export const formatAuditHumanSentence = (evt: EventLine): string => {
  const p = evt.payload;
  switch (evt.type) {
    case "EpicCreated":
      return formatEpicStoryTicketCreated(evt, "epic");
    case "EpicUpdated":
      return formatWorkItemUpdated(evt, "epic");
    case "EpicDeleted":
      return formatDeleted(evt, "epic");
    case "StoryCreated":
      return formatEpicStoryTicketCreated(evt, "story");
    case "StoryUpdated":
      return formatWorkItemUpdated(evt, "story");
    case "StoryDeleted":
      return formatDeleted(evt, "story");
    case "TicketCreated":
      return formatEpicStoryTicketCreated(evt, "ticket");
    case "TicketUpdated":
      return formatWorkItemUpdated(evt, "ticket");
    case "TicketDeleted":
      return formatDeleted(evt, "ticket");
    case "TicketCommentAdded": {
      const ticketId = String(p["ticketId"] ?? "");
      return `${sentencePrefix(evt)} added a comment on ticket ${ticketId}`;
    }
    case "SyncCursor":
      return `${sentencePrefix(evt)} advanced the GitHub sync cursor`;
    case "GithubIssueLinked": {
      const ticketId = String(p["ticketId"] ?? "");
      const n = pickNum(p, "issueNumber");
      const issuePart =
        n !== undefined ? `GitHub issue #${n}` : "a GitHub issue";
      return `${sentencePrefix(evt)} linked ticket ${ticketId} to ${issuePart}`;
    }
    case "GithubInboundUpdate": {
      const entity = String(p["entity"] ?? "");
      const entityId = String(p["entityId"] ?? "");
      const bits: string[] = [
        `${sentencePrefix(evt)} synced ${entity} ${entityId} from GitHub`,
      ];
      if (p["status"] !== undefined) {
        bits.push(`status is now ${quoteStatus(String(p["status"]))}`);
      }
      if (p["assignee"] !== undefined) {
        if (p["assignee"] === null) {
          bits.push("assignee cleared");
        } else if (typeof p["assignee"] === "string") {
          bits.push(`assignee set to ${quoteStatus(p["assignee"])}`);
        }
      }
      if (p["title"] !== undefined) {
        bits.push("updated the title");
      }
      if (p["body"] !== undefined) {
        bits.push("updated the description");
      }
      if (p["labels"] !== undefined) {
        if (p["labels"] === null) {
          bits.push("cleared labels");
        } else {
          bits.push("updated labels");
        }
      }
      if (p["priority"] !== undefined) {
        bits.push("updated priority");
      }
      if (p["size"] !== undefined) {
        bits.push("updated size");
      }
      if (p["estimate"] !== undefined) {
        bits.push("updated estimate");
      }
      if (p["startWorkAt"] !== undefined) {
        bits.push("updated start work date");
      }
      if (p["targetFinishAt"] !== undefined) {
        bits.push("updated target finish date");
      }
      return bits.join("; ");
    }
    case "GithubPrActivity": {
      const ticketId = String(p["ticketId"] ?? "");
      const pr = pickNum(p, "prNumber");
      const kind = String(p["kind"] ?? "activity");
      const prPhrase =
        pr !== undefined ? `pull request #${pr}` : "a pull request";
      let line = `${sentencePrefix(evt)} recorded ${kind} on ${prPhrase} for ticket ${ticketId}`;
      const rs = pickStr(p, "reviewState");
      if (rs !== undefined) {
        line += ` (${rs})`;
      }
      return line;
    }
  }
};

export type FormatAuditPlainLinesOpts = {
  style: "plain" | "plain-links";
  /** When set, enriches `plain-links` metadata with derived GitHub HTML URLs. */
  githubRepo?: { owner: string; repo: string };
};

/**
 * Renders filtered audit events as human lines, optionally with tab-separated JSON metadata.
 *
 * @param events - Events sorted by `ts` (newest-last order preserved).
 * @param opts - `plain` vs `plain-links` and optional GitHub repo for URL derivation.
 */
export const formatAuditPlainLines = (
  events: EventLine[],
  opts: FormatAuditPlainLinesOpts,
): string => {
  const lines = events.map((evt) => {
    const sentence = formatAuditHumanSentence(evt);
    if (opts.style === "plain-links") {
      const meta = buildAuditLinkMetadata(evt, opts.githubRepo);
      return `${sentence}\t${JSON.stringify(meta)}`;
    }
    return sentence;
  });
  return lines.join("\n");
};
