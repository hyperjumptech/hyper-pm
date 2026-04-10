import type { Octokit } from "@octokit/rest";
import { ulid } from "ulid";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { buildPrOpenSourceId } from "../lib/github-pr-activity";
import { appendEventLine } from "../storage/append-event";
import type { EventLine } from "../storage/event-line";
import type { Projection } from "../storage/projection";
import { readAllEventLines } from "../storage/read-event-lines";
import { collectGithubPrActivitySourceIdsFromLines } from "./collect-github-pr-activity-source-ids";
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
 * Ingests GitHub PR timeline activity for tickets in `in_progress` with linked PRs, appending `GithubPrActivity` lines.
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

  const lines = await params.deps.readEventLines();
  const seen = collectGithubPrActivitySourceIdsFromLines(lines);

  for (const ticket of params.projection.tickets.values()) {
    if (ticket.deleted) continue;
    if (ticket.status !== "in_progress") continue;
    if (ticket.linkedPrs.length === 0) continue;

    for (const prNumber of ticket.linkedPrs) {
      const openSourceId = buildPrOpenSourceId(ticket.id, prNumber);
      if (!seen.has(openSourceId)) {
        try {
          const { data: pr } = await params.deps.octokit.rest.pulls.get({
            owner: params.deps.owner,
            repo: params.deps.repo,
            pull_number: prNumber,
          });
          const createdAt = pr.created_at;
          if (createdAt) {
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
