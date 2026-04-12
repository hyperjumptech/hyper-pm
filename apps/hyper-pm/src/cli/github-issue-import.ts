import { assigneeFromGithubIssue } from "../lib/github-assignee";
import {
  extractDescriptionBeforeFirstFence,
  inboundTicketPlanningPayloadFromFenceMeta,
  parseHyperPmFenceObject,
  parseHyperPmIdFromIssueBody,
} from "../lib/github-issue-body";
import { ticketLabelsFromGithubIssueLabels } from "../lib/github-issue-labels";
import type { Projection } from "../storage/projection";

/**
 * Minimal GitHub REST issue fields used for import selection and payload mapping.
 */
export type GithubRestIssueImportSlice = {
  number: number;
  title?: string | null;
  body?: string | null;
  state?: string | null;
  labels?: unknown;
  assignees?: readonly { login?: string | null }[] | null;
  /** Present on pull requests returned by the issues list endpoint. */
  pull_request?: unknown;
};

/** Reasons an issue was not imported. */
export type GithubIssueImportSkipReason =
  | "pull_request"
  | "issue_filter"
  | "already_linked"
  | "body_hyper_pm_existing_ticket"
  | "body_hyper_pm_orphan_ref";

/** One skipped issue with a stable reason code for CLI JSON output. */
export type GithubIssueImportSkip = {
  issueNumber: number;
  reason: GithubIssueImportSkipReason;
};

/**
 * One issue that should become a `TicketCreated` + `GithubIssueLinked` pair.
 * The caller supplies a new ticket `id` (ULID) and optional `storyId`.
 */
export type GithubIssueImportCandidate = {
  issueNumber: number;
  /** Fields for `TicketCreated` before caller adds `id` / optional `storyId`. */
  ticketCreatedPayloadBase: Record<string, unknown>;
};

/**
 * Collects GitHub issue numbers already linked to a non-deleted ticket.
 *
 * @param projection - Current replayed projection.
 * @returns A set of linked issue numbers.
 */
export const collectLinkedGithubIssueNumbers = (
  projection: Projection,
): Set<number> => {
  const out = new Set<number>();
  for (const ticket of projection.tickets.values()) {
    if (ticket.deleted) continue;
    const n = ticket.githubIssueNumber;
    if (n !== undefined && Number.isFinite(n)) {
      out.add(n);
    }
  }
  return out;
};

/**
 * Normalizes a GitHub issue title for hyper-pm storage (drops outbound `[hyper-pm]` prefix).
 *
 * @param title - Raw GitHub issue title.
 * @returns Trimmed title without the hyper-pm prefix.
 */
export const stripHyperPmGithubIssueTitle = (title: string): string =>
  title.replace(/^\[hyper-pm\]\s*/i, "").trim();

/**
 * Parses `--state` for `issues.listForRepo` (`open`, `closed`, or `all`).
 *
 * @param raw - Raw CLI value.
 * @returns The API state token, or `undefined` when invalid.
 */
export const tryParseGithubImportListState = (
  raw: string | undefined,
): "open" | "closed" | "all" | undefined => {
  if (raw === undefined || raw === "") return "all";
  const t = raw.trim().toLowerCase();
  if (t === "open" || t === "closed" || t === "all") return t;
  return undefined;
};

/**
 * Parses repeatable `--issue` values into a set of positive finite issue numbers.
 *
 * @param raw - Each entry may be a single number or comma-separated numbers.
 * @returns `undefined` when `raw` is empty (no filter); otherwise a non-empty set.
 */
export const parseGithubImportIssueNumberSet = (
  raw: readonly string[] | undefined,
): Set<number> | undefined => {
  if (raw === undefined || raw.length === 0) return undefined;
  const out = new Set<number>();
  for (const piece of raw) {
    for (const token of piece.split(",")) {
      const t = token.trim();
      if (t === "") continue;
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid --issue value: ${JSON.stringify(token)}`);
      }
      out.add(n);
    }
  }
  if (out.size === 0) {
    throw new Error("No valid --issue numbers after parsing flags");
  }
  return out;
};

/**
 * Merges fence-derived planning fields safe for `TicketCreated` (drops `null` clears).
 *
 * @param meta - Parsed JSON object from the first ```json fence, if any.
 * @returns Payload fragment keys compatible with `TicketCreated` planning.
 */
export const ticketCreatePlanningFragmentFromFenceMeta = (
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  if (meta === undefined) return {};
  const src = inboundTicketPlanningPayloadFromFenceMeta(meta);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (v !== null && v !== undefined) {
      out[k] = v;
    }
  }
  return out;
};

/**
 * Builds the `TicketCreated` payload for importing one GitHub issue (excluding `id` and `storyId`).
 *
 * @param issue - REST-shaped issue slice.
 * @returns Payload fields for `TicketCreated` before caller adds `id` / optional `storyId`.
 */
export const buildTicketCreatedPayloadBaseFromGithubIssue = (
  issue: GithubRestIssueImportSlice,
): Record<string, unknown> => {
  const bodyText = issue.body ?? "";
  const title = stripHyperPmGithubIssueTitle(String(issue.title ?? ""));
  const desc = extractDescriptionBeforeFirstFence(bodyText);
  const payload: Record<string, unknown> = {
    title,
    body: desc,
  };
  if (issue.state === "closed") {
    payload["state"] = "closed";
  }
  const assignee = assigneeFromGithubIssue(issue);
  if (assignee !== undefined && assignee !== "") {
    payload["assignee"] = assignee;
  }
  const labels = ticketLabelsFromGithubIssueLabels(issue.labels);
  if (labels.length > 0) {
    payload["labels"] = labels;
  }
  const meta = parseHyperPmFenceObject(bodyText);
  Object.assign(payload, ticketCreatePlanningFragmentFromFenceMeta(meta));
  return payload;
};

/**
 * Classifies one GitHub issue as importable or skipped, given the current projection.
 *
 * @param params - Projection, linked-number set, optional issue-number allowlist, and issue row.
 * @returns Either a skip record or a candidate with full create payload (without `id` / `storyId`).
 */
export const classifyGithubIssueForImport = (params: {
  projection: Projection;
  linkedNumbers: ReadonlySet<number>;
  onlyIssueNumbers?: ReadonlySet<number>;
  issue: GithubRestIssueImportSlice;
}):
  | { result: "skip"; skip: GithubIssueImportSkip }
  | {
      result: "candidate";
      ticketCreatedPayloadBase: Record<string, unknown>;
    } => {
  const num = params.issue.number;
  if (!Number.isFinite(num) || num < 1) {
    return {
      result: "skip",
      skip: { issueNumber: 0, reason: "issue_filter" },
    };
  }
  if (
    params.onlyIssueNumbers !== undefined &&
    !params.onlyIssueNumbers.has(num)
  ) {
    return {
      result: "skip",
      skip: { issueNumber: num, reason: "issue_filter" },
    };
  }
  if (
    params.issue.pull_request !== undefined &&
    params.issue.pull_request !== null
  ) {
    return {
      result: "skip",
      skip: { issueNumber: num, reason: "pull_request" },
    };
  }
  if (params.linkedNumbers.has(num)) {
    return {
      result: "skip",
      skip: { issueNumber: num, reason: "already_linked" },
    };
  }
  const body = params.issue.body ?? "";
  const hyperPmId = parseHyperPmIdFromIssueBody(body);
  if (hyperPmId !== undefined && hyperPmId.trim() !== "") {
    const row = params.projection.tickets.get(hyperPmId);
    if (row !== undefined && !row.deleted) {
      return {
        result: "skip",
        skip: { issueNumber: num, reason: "body_hyper_pm_existing_ticket" },
      };
    }
    return {
      result: "skip",
      skip: { issueNumber: num, reason: "body_hyper_pm_orphan_ref" },
    };
  }
  return {
    result: "candidate",
    ticketCreatedPayloadBase: buildTicketCreatedPayloadBaseFromGithubIssue(
      params.issue,
    ),
  };
};

/**
 * Partitions a list of GitHub issues into import candidates and skipped rows.
 *
 * @param params - Projection, issues from the API, and optional `--issue` allowlist.
 * @returns Candidates (each needs `id` + optional `storyId` merged) and skips with reasons.
 */
export const partitionGithubIssuesForImport = (params: {
  projection: Projection;
  issues: readonly GithubRestIssueImportSlice[];
  onlyIssueNumbers?: ReadonlySet<number>;
}): {
  candidates: GithubIssueImportCandidate[];
  skipped: GithubIssueImportSkip[];
} => {
  const linkedNumbers = collectLinkedGithubIssueNumbers(params.projection);
  const candidates: GithubIssueImportCandidate[] = [];
  const skipped: GithubIssueImportSkip[] = [];
  for (const issue of params.issues) {
    const r = classifyGithubIssueForImport({
      projection: params.projection,
      linkedNumbers,
      onlyIssueNumbers: params.onlyIssueNumbers,
      issue,
    });
    if (r.result === "skip") {
      skipped.push(r.skip);
    } else {
      candidates.push({
        issueNumber: issue.number,
        ticketCreatedPayloadBase: r.ticketCreatedPayloadBase,
      });
    }
  }
  return { candidates, skipped };
};

/**
 * Attaches `id` and optional `storyId` to a ticket create payload base.
 *
 * @param ticketId - New ticket ULID.
 * @param base - From {@link buildTicketCreatedPayloadBaseFromGithubIssue}.
 * @param storyId - Optional story id (trimmed); omitted when undefined or empty.
 * @returns Full `TicketCreated` payload.
 */
export const mergeTicketImportCreatePayload = (
  ticketId: string,
  base: Record<string, unknown>,
  storyId: string | undefined,
): Record<string, unknown> => {
  const storyTrimmed =
    storyId !== undefined && storyId !== "" ? storyId.trim() : undefined;
  const storyPayload =
    storyTrimmed !== undefined && storyTrimmed !== ""
      ? { storyId: storyTrimmed }
      : {};
  return { id: ticketId, ...base, ...storyPayload };
};
