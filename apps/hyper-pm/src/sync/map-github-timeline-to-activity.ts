import type {
  GithubPrActivityKind,
  GithubPrReviewState,
} from "../lib/github-pr-activity";

/** Minimal GitHub issue timeline item shape (REST). */
export type GithubTimelineItemInput = {
  id?: number;
  event?: string | null;
  created_at?: string | null;
  actor?: { login?: string | null } | null;
  /** Present on `reviewed` timeline events. */
  state?: string | null;
  url?: string | null;
};

export type GithubPrActivityPayloadFields = {
  ticketId: string;
  prNumber: number;
  kind: GithubPrActivityKind;
  sourceId: string;
  occurredAt: string;
  reviewState?: GithubPrReviewState;
  url?: string;
};

const mapReviewState = (
  state: string | null | undefined,
): GithubPrReviewState | undefined => {
  const s = state?.trim().toLowerCase();
  if (s === "approved") return "approved";
  if (s === "changes_requested") return "changes_requested";
  if (s === "commented") return "commented";
  return undefined;
};

/**
 * Maps a GitHub issue timeline REST item to durable PR activity fields, or skips * events we do not surface.
 *
 * @param item - Raw timeline element from `issues.listEventsForTimeline`.
 * @param ticketId - Hyper-pm ticket id this PR is linked to.
 * @param prNumber - Pull request / issue number on GitHub.
 */
export const mapGithubTimelineItemToActivityPayload = (
  item: GithubTimelineItemInput,
  ticketId: string,
  prNumber: number,
): GithubPrActivityPayloadFields | null => {
  if (item.id === undefined || item.id === null) return null;
  const created = item.created_at?.trim();
  if (!created) return null;
  const ev = item.event?.trim() ?? "";
  let kind: GithubPrActivityKind | null = null;
  if (ev === "commented") kind = "commented";
  else if (ev === "reviewed") kind = "reviewed";
  else if (ev === "head_ref_force_pushed" || ev === "committed")
    kind = "updated";
  else if (ev === "merged") kind = "merged";
  else if (ev === "closed") kind = "closed";
  else if (ev === "ready_for_review") kind = "ready_for_review";
  if (kind === null) return null;
  const sourceId = `github-timeline:${item.id}`;
  const reviewState =
    kind === "reviewed" ? mapReviewState(item.state) : undefined;
  const url = item.url?.trim();
  return {
    ticketId,
    prNumber,
    kind,
    sourceId,
    occurredAt: created,
    ...(reviewState !== undefined ? { reviewState } : {}),
    ...(url ? { url } : {}),
  };
};

/**
 * Builds payload fields for the synthetic PR-opened seed from `pulls.get` metadata.
 *
 * @param ticketId - Hyper-pm ticket id.
 * @param prNumber - Pull request number.
 * @param createdAt - ISO timestamp from the pull request `created_at` field.
 * @param sourceId - Stable dedup id (see {@link buildPrOpenSourceId}).
 * @param url - Optional HTML URL of the pull request.
 */
export const buildPrOpenedPayloadFromPull = (params: {
  ticketId: string;
  prNumber: number;
  createdAt: string;
  sourceId: string;
  url?: string;
}): GithubPrActivityPayloadFields => ({
  ticketId: params.ticketId,
  prNumber: params.prNumber,
  kind: "opened",
  sourceId: params.sourceId,
  occurredAt: params.createdAt,
  ...(params.url ? { url: params.url } : {}),
});
