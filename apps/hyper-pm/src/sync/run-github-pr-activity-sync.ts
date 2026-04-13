import type { Octokit } from "@octokit/rest";
import { ulid } from "ulid";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { buildPrOpenSourceId } from "../lib/github-pr-activity";
import type { WorkItemStatus } from "../lib/work-item-status";
import { appendEventLine } from "../storage/append-event";
import type { EventLine } from "../storage/event-line";
import type { Projection, TicketRecord } from "../storage/projection";
import { readAllEventLines } from "../storage/read-event-lines";
import { collectGithubPrActivitySourceIdsFromLines } from "./collect-github-pr-activity-source-ids";
import { loadOpenPrsByClosingIssueIndex } from "./load-open-prs-by-closing-issue-index";
import { listPullNumbersLinkedToGithubIssue } from "./list-pull-numbers-linked-to-github-issue";
import {
  buildPrOpenedPayloadFromPull,
  mapGithubTimelineItemToActivityPayload,
  type GithubTimelineItemInput,
} from "./map-github-timeline-to-activity";

export type GithubPrActivitySyncDeps = {
  octokit: Octokit;
  owner: string;
  repo: string;
  clock: { now: () => Date };
  /** Fallback audit label when GitHub does not provide a user login. */
  actor: string;
  readEventLines: () => Promise<string[]>;
  appendEvent: (evt: EventLine) => Promise<void>;
  /**
   * Optional human-oriented progress lines (CLI sends these to stderr so `--format json` stdout stays clean).
   */
  reportProgress?: (message: string) => void;
};

/**
 * Prefers `github:<login>` for timeline attribution, otherwise the sync fallback actor.
 *
 * @param login - GitHub user login from an API payload, if any.
 * @param fallback - Token-based actor when login is absent.
 */
const githubActorFromLogin = (
  login: string | null | undefined,
  fallback: string,
): string => {
  const t = login?.trim();
  return t ? `github:${t}` : fallback;
};

/**
 * Whether a ticket may trigger linked-PR timeline fetches during full GitHub sync.
 *
 * @param ticket - Projection row (non-deleted, non-terminal status, PR refs in body and/or linked GitHub issue).
 */
const isTicketEligibleForPrActivitySync = (ticket: {
  deleted?: boolean;
  linkedPrs: readonly number[];
  githubIssueNumber?: number;
  status: WorkItemStatus;
}): boolean =>
  !ticket.deleted &&
  (ticket.linkedPrs.length > 0 || ticket.githubIssueNumber !== undefined) &&
  ticket.status !== "done" &&
  ticket.status !== "cancelled";

/**
 * Deduplicates and sorts PR numbers for stable iteration.
 *
 * @param numbers - Candidate pull request numbers.
 * @returns Sorted unique list.
 */
const uniqSortedPrNumbers = (numbers: readonly number[]): number[] =>
  [...new Set(numbers)].sort((a, b) => a - b);

/**
 * Serializes mapped timeline fields into a JSONL payload object.
 *
 * @param fields - Non-null mapping result from {@link mapGithubTimelineItemToActivityPayload}.
 */
const timelinePayloadRecord = (
  fields: NonNullable<
    ReturnType<typeof mapGithubTimelineItemToActivityPayload>
  >,
): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    ticketId: fields.ticketId,
    prNumber: fields.prNumber,
    kind: fields.kind,
    sourceId: fields.sourceId,
    occurredAt: fields.occurredAt,
  };
  if (fields.reviewState !== undefined) {
    base["reviewState"] = fields.reviewState;
  }
  if (fields.url !== undefined) {
    base["url"] = fields.url;
  }
  return base;
};

/**
 * Ingests GitHub PR timeline activity for non-terminal tickets with `Refs`/`Closes`/`Fixes` in the body and/or PRs linked to `githubIssueNumber` on GitHub, appending `GithubPrActivity` lines.
 * Replaying `kind: "opened"` moves the ticket to `in_progress` in the projection.
 * Returns early when `config.sync !== "full"` (the CLI uses `hyperPmConfigForSyncWithGithub` for `sync --with-github`).
 *
 * @param params - Projection (fresh after inbound), config, and injectable deps.
 * @returns Newly appended event lines.
 */
export const runGithubPrActivitySync = async (params: {
  projection: Projection;
  config: HyperPmConfig;
  deps: GithubPrActivitySyncDeps;
}): Promise<EventLine[]> => {
  const out: EventLine[] = [];
  if (params.config.sync !== "full") {
    return out;
  }

  const needsClosingBodyIndex = [...params.projection.tickets.values()].some(
    (t) =>
      isTicketEligibleForPrActivitySync(t) && t.githubIssueNumber !== undefined,
  );
  const closingIssuePrIndex = needsClosingBodyIndex
    ? await loadOpenPrsByClosingIssueIndex({
        octokit: params.deps.octokit,
        owner: params.deps.owner,
        repo: params.deps.repo,
      })
    : new Map<number, number[]>();

  const prWorkQueue: { ticket: TicketRecord; prNumbers: number[] }[] = [];
  for (const ticket of params.projection.tickets.values()) {
    if (!isTicketEligibleForPrActivitySync(ticket)) continue;

    let fromGithubIssue: number[] = [];
    if (ticket.githubIssueNumber !== undefined) {
      try {
        fromGithubIssue = await listPullNumbersLinkedToGithubIssue({
          octokit: params.deps.octokit,
          owner: params.deps.owner,
          repo: params.deps.repo,
          issueNumber: ticket.githubIssueNumber,
        });
      } catch {
        fromGithubIssue = [];
      }
    }
    const fromSearch =
      ticket.githubIssueNumber !== undefined
        ? (closingIssuePrIndex.get(ticket.githubIssueNumber) ?? [])
        : [];
    const prNumbers = uniqSortedPrNumbers([
      ...ticket.linkedPrs,
      ...fromGithubIssue,
      ...fromSearch,
    ]);
    if (prNumbers.length === 0) continue;
    prWorkQueue.push({ ticket, prNumbers });
  }

  const totalLinkedPrs = prWorkQueue.reduce(
    (sum, row) => sum + row.prNumbers.length,
    0,
  );
  params.deps.reportProgress?.(
    `hyper-pm: GitHub PR activity — loading timelines for ${totalLinkedPrs} linked PR(s)…`,
  );

  const lines = await params.deps.readEventLines();
  const seen = collectGithubPrActivitySourceIdsFromLines(lines);

  let prActivityDone = 0;
  const reportPrChunk = (): void => {
    const rp = params.deps.reportProgress;
    if (
      !rp ||
      totalLinkedPrs === 0 ||
      (prActivityDone % 10 !== 0 && prActivityDone !== totalLinkedPrs)
    ) {
      return;
    }
    rp(
      `hyper-pm: GitHub PR activity — processed ${prActivityDone}/${totalLinkedPrs} linked PR(s)…`,
    );
  };

  for (const { ticket, prNumbers } of prWorkQueue) {
    for (const prNumber of prNumbers) {
      prActivityDone += 1;
      reportPrChunk();
      const openSourceId = buildPrOpenSourceId(ticket.id, prNumber);
      if (!seen.has(openSourceId)) {
        try {
          const { data: pr } = await params.deps.octokit.rest.pulls.get({
            owner: params.deps.owner,
            repo: params.deps.repo,
            pull_number: prNumber,
          });
          const createdAt = pr.created_at;
          if (createdAt && pr.state === "open") {
            const fields = buildPrOpenedPayloadFromPull({
              ticketId: ticket.id,
              prNumber,
              createdAt,
              sourceId: openSourceId,
              url: pr.html_url ?? undefined,
            });
            const payload: Record<string, unknown> = {
              ticketId: fields.ticketId,
              prNumber: fields.prNumber,
              kind: fields.kind,
              sourceId: fields.sourceId,
              occurredAt: fields.occurredAt,
            };
            if (fields.url !== undefined) {
              payload["url"] = fields.url;
            }
            const evt: EventLine = {
              schema: 1,
              type: "GithubPrActivity",
              id: ulid(),
              ts: fields.occurredAt,
              actor: githubActorFromLogin(pr.user?.login, params.deps.actor),
              payload,
            };
            await params.deps.appendEvent(evt);
            seen.add(openSourceId);
            out.push(evt);
          }
        } catch {
          /* PR missing or API error — skip seed for this number */
        }
      }

      let timeline: GithubTimelineItemInput[] = [];
      try {
        timeline = (await params.deps.octokit.paginate(
          params.deps.octokit.rest.issues.listEventsForTimeline,
          {
            owner: params.deps.owner,
            repo: params.deps.repo,
            issue_number: prNumber,
            per_page: 100,
          },
        )) as GithubTimelineItemInput[];
      } catch {
        continue;
      }

      const sorted = [...timeline].sort((a, b) => {
        const ca = a.created_at ?? "";
        const cb = b.created_at ?? "";
        const t = ca.localeCompare(cb);
        if (t !== 0) return t;
        return (a.id ?? 0) - (b.id ?? 0);
      });

      for (const item of sorted) {
        const fields = mapGithubTimelineItemToActivityPayload(
          item,
          ticket.id,
          prNumber,
        );
        if (!fields) continue;
        if (seen.has(fields.sourceId)) continue;
        const evt: EventLine = {
          schema: 1,
          type: "GithubPrActivity",
          id: ulid(),
          ts: fields.occurredAt,
          actor: githubActorFromLogin(item.actor?.login, params.deps.actor),
          payload: timelinePayloadRecord(fields),
        };
        await params.deps.appendEvent(evt);
        seen.add(fields.sourceId);
        out.push(evt);
      }
    }
  }

  return out;
};

/**
 * Production deps: reads JSONL from `dataRoot` and appends via {@link appendEventLine}.
 *
 * @param params.dataRoot - Data branch worktree root.
 * @param params.clock - Injectable clock (tests use fixed times).
 * @param params.octokit - Authenticated REST client.
 * @param params.owner - Repository owner.
 * @param params.repo - Repository name.
 * @param params.actor - Fallback audit label for the sync user.
 */
export const defaultGithubPrActivitySyncDeps = (params: {
  dataRoot: string;
  clock: { now: () => Date };
  octokit: Octokit;
  owner: string;
  repo: string;
  actor: string;
}): GithubPrActivitySyncDeps => ({
  octokit: params.octokit,
  owner: params.owner,
  repo: params.repo,
  clock: params.clock,
  actor: params.actor,
  readEventLines: () => readAllEventLines(params.dataRoot),
  appendEvent: async (evt) => {
    await appendEventLine(params.dataRoot, evt, params.clock);
  },
});
