import { z } from "zod";

/** Maximum PR activity rows kept on each ticket during event replay. */
export const GITHUB_PR_ACTIVITY_RECENT_CAP = 20;

/** Normalized PR lifecycle sub-event kinds stored on `GithubPrActivity` payloads. */
export const githubPrActivityKindSchema = z.enum([
  "opened",
  "updated",
  "commented",
  "reviewed",
  "merged",
  "closed",
  "ready_for_review",
]);

/** GitHub review outcome when `kind` is `reviewed`. */
export const githubPrReviewStateSchema = z.enum([
  "approved",
  "changes_requested",
  "commented",
]);

export type GithubPrActivityKind = z.infer<typeof githubPrActivityKindSchema>;
export type GithubPrReviewState = z.infer<typeof githubPrReviewStateSchema>;

/** One PR activity row surfaced on `TicketRecord` after replay. */
export type TicketPrActivitySummary = {
  prNumber: number;
  kind: GithubPrActivityKind;
  occurredAt: string;
  sourceId: string;
  reviewState?: GithubPrReviewState;
  url?: string;
};

/**
 * Builds the stable `sourceId` for the synthetic “PR opened” seed event.
 *
 * @param ticketId - Hyper-pm ticket id.
 * @param prNumber - GitHub pull request number.
 */
export const buildPrOpenSourceId = (
  ticketId: string,
  prNumber: number,
): string => `hyper-pm:pr-open:${ticketId}:${prNumber}`;

/**
 * Parses a `GithubPrActivity` payload fragment into a summary for projection updates.
 *
 * @param payload - Raw event payload.
 * @returns Parsed summary, or `undefined` when required fields are missing or invalid.
 */
export const parseGithubPrActivityPayload = (
  payload: Record<string, unknown>,
): TicketPrActivitySummary | undefined => {
  const ticketId = payload["ticketId"];
  const prRaw = payload["prNumber"];
  const kindRaw = payload["kind"];
  const occurredAt = payload["occurredAt"];
  const sourceId = payload["sourceId"];
  if (
    typeof ticketId !== "string" ||
    typeof occurredAt !== "string" ||
    typeof sourceId !== "string"
  ) {
    return undefined;
  }
  const prNumber = typeof prRaw === "number" ? prRaw : Number(prRaw);
  if (!Number.isFinite(prNumber)) return undefined;
  const kindParsed = githubPrActivityKindSchema.safeParse(kindRaw);
  if (!kindParsed.success) return undefined;
  const out: TicketPrActivitySummary = {
    prNumber,
    kind: kindParsed.data,
    occurredAt,
    sourceId,
  };
  const url = payload["url"];
  if (typeof url === "string" && url.length > 0) {
    out.url = url;
  }
  const rs = githubPrReviewStateSchema.safeParse(payload["reviewState"]);
  if (rs.success) {
    out.reviewState = rs.data;
  }
  return out;
};
