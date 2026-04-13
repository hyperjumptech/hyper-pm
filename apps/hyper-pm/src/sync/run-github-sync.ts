import { Octokit } from "@octokit/rest";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { assigneeFromGithubIssue } from "../lib/github-assignee";
import {
  buildGithubIssueBody,
  extractDescriptionBeforeFirstFence,
  inboundTicketPlanningPayloadFromFenceMeta,
  parseHyperPmFenceObject,
  parseHyperPmIdFromIssueBody,
  parseHyperPmTicketFenceObject,
  ticketPlanningForGithubIssueBody,
} from "../lib/github-issue-body";
import {
  mergeOutboundGithubIssueLabelsForTicket,
  ticketLabelsFromGithubIssueLabels,
} from "../lib/github-issue-labels";
import {
  parseTicketDependsOnFromPayloadValue,
  ticketDependsOnListsEqual,
} from "../lib/ticket-depends-on";
import { ticketLabelListsEqual } from "../lib/ticket-planning-fields";
import {
  resolveTicketInboundStatus,
  statusToGithubIssueState,
} from "../lib/work-item-status";
import type { EventLine } from "../storage/event-line";
import { appendEventLine } from "../storage/append-event";
import type { Projection, TicketRecord } from "../storage/projection";
import { replayEvents } from "../storage/projection";
import { readAllEventLines } from "../storage/read-event-lines";
import { githubInboundActorFromIssue } from "./github-inbound-actor";
import { resolveGithubTokenActor } from "./resolve-github-token-actor";

export type GithubSyncDeps = {
  octokit: Octokit;
  owner: string;
  repo: string;
  clock: { now: () => Date };
  /** When set, used as outbound/sync cursor `actor` (avoids an extra `getAuthenticated` call). */
  outboundActor?: string;
  /**
   * Optional human-oriented progress lines (CLI sends these to stderr so `--format json` stdout stays clean).
   */
  reportProgress?: (message: string) => void;
};

/**
 * Returns true when a row from `issues.listForRepo` is a pull request (not a GitHub Issue).
 *
 * @param issue - REST list payload element.
 */
const isGithubListRowPullRequest = (issue: {
  pull_request?: unknown;
}): boolean => issue.pull_request != null;

const parseRepo = (githubRepo: string): { owner: string; repo: string } => {
  const [owner, repo] = githubRepo.split("/");
  if (!owner || !repo) {
    throw new Error(
      `Invalid githubRepo "${githubRepo}" (expected owner/repo).`,
    );
  }
  return { owner, repo: repo.replace(/\.git$/, "") };
};

/**
 * Runs outbound GitHub issue creation/updates for ticket-level mapping.
 *
 * @param params - Data worktree path, projection, config, and API deps.
 */
export const runGithubOutboundSync = async (params: {
  dataRoot: string;
  projection: Projection;
  config: HyperPmConfig;
  deps: GithubSyncDeps;
}): Promise<EventLine[]> => {
  const outEvents: EventLine[] = [];
  if (params.config.issueMapping !== "ticket") {
    return outEvents;
  }
  const actor =
    params.deps.outboundActor ??
    (await resolveGithubTokenActor(params.deps.octokit));
  const ts = params.deps.clock.now().toISOString();
  const tickets = [...params.projection.tickets.values()].filter(
    (t) => !t.deleted,
  );
  params.deps.reportProgress?.(
    `hyper-pm: GitHub outbound — syncing ${tickets.length} ticket(s) to GitHub issues…`,
  );
  let outboundProcessed = 0;
  /**
   * Resolves epic+story ids for GitHub issue metadata when the ticket is linked to a valid story chain.
   *
   * @param ticket - Ticket row from the projection (caller skips deleted tickets).
   * @returns Both ids when story and epic exist and are not deleted; otherwise `undefined`.
   */
  const resolveTicketGithubParents = (
    ticket: TicketRecord,
  ): { epicId: string; storyId: string } | undefined => {
    if (ticket.storyId === null) {
      return undefined;
    }
    const story = params.projection.stories.get(ticket.storyId);
    if (!story || story.deleted) {
      return undefined;
    }
    const epic = params.projection.epics.get(story.epicId);
    if (!epic || epic.deleted) {
      return undefined;
    }
    return { epicId: epic.id, storyId: story.id };
  };

  const reportOutboundChunk = (): void => {
    const rp = params.deps.reportProgress;
    if (
      !rp ||
      tickets.length === 0 ||
      (outboundProcessed % 25 !== 0 && outboundProcessed !== tickets.length)
    ) {
      return;
    }
    rp(
      `hyper-pm: GitHub outbound — processed ${outboundProcessed}/${tickets.length} ticket(s)…`,
    );
  };

  for (const ticket of tickets) {
    const parents = resolveTicketGithubParents(ticket);
    const parentIdsForBody =
      parents !== undefined
        ? { epic: parents.epicId, story: parents.storyId }
        : ({} as Record<string, string | undefined>);
    const ticketPlanning = ticketPlanningForGithubIssueBody(ticket);
    const ghLabels = mergeOutboundGithubIssueLabelsForTicket(ticket.labels);

    if (ticket.githubIssueNumber !== undefined) {
      await params.deps.octokit.rest.issues.update({
        owner: params.deps.owner,
        repo: params.deps.repo,
        issue_number: ticket.githubIssueNumber,
        title: `[hyper-pm] ${ticket.title}`,
        body: buildGithubIssueBody({
          hyperPmId: ticket.id,
          type: "ticket",
          parentIds: parentIdsForBody,
          description: ticket.body,
          ticketPlanning,
        }),
        state: statusToGithubIssueState(ticket.status),
        assignees: ticket.assignee ? [ticket.assignee] : [],
        labels: ghLabels,
      });
      outboundProcessed += 1;
      reportOutboundChunk();
      continue;
    }
    if (parents === undefined) {
      outboundProcessed += 1;
      reportOutboundChunk();
      continue;
    }
    const created = await params.deps.octokit.rest.issues.create({
      owner: params.deps.owner,
      repo: params.deps.repo,
      title: `[hyper-pm] ${ticket.title}`,
      body: buildGithubIssueBody({
        hyperPmId: ticket.id,
        type: "ticket",
        parentIds: { epic: parents.epicId, story: parents.storyId },
        description: ticket.body,
        ticketPlanning,
      }),
      labels: ghLabels,
      assignees: ticket.assignee ? [ticket.assignee] : [],
    });
    const num = created.data.number;
    const linkEvt: EventLine = {
      schema: 1,
      type: "GithubIssueLinked",
      id: `gh-link-${ticket.id}-${num}`,
      ts,
      actor,
      payload: { ticketId: ticket.id, issueNumber: num },
    };
    outEvents.push(linkEvt);
    await appendEventLine(params.dataRoot, linkEvt, params.deps.clock);
    outboundProcessed += 1;
    reportOutboundChunk();
  }
  const cursorEvt: EventLine = {
    schema: 1,
    type: "SyncCursor",
    id: `sync-${ts}`,
    ts,
    actor,
    payload: { cursor: ts },
  };

  outEvents.push(cursorEvt);
  await appendEventLine(params.dataRoot, cursorEvt, params.deps.clock);
  return outEvents;
};

/**
 * Inbound sync: title/body/status (and related fields) for issues referencing hyper-pm ids.
 * No-ops when `config.sync !== "full"` (the CLI passes `hyperPmConfigForSyncWithGithub` for `sync --with-github`).
 *
 * @param params - Data worktree root, projection baseline, config, deps.
 */
export const runGithubInboundSync = async (params: {
  dataRoot: string;
  projection: Projection;
  config: HyperPmConfig;
  deps: GithubSyncDeps;
}): Promise<EventLine[]> => {
  const out: EventLine[] = [];
  if (params.config.sync !== "full") return out;
  const ts = params.deps.clock.now().toISOString();

  params.deps.reportProgress?.(
    "hyper-pm: GitHub inbound — listing repository issues from GitHub…",
  );
  const issues = await params.deps.octokit.paginate(
    params.deps.octokit.rest.issues.listForRepo,
    {
      owner: params.deps.owner,
      repo: params.deps.repo,
      state: "all",
      per_page: 100,
    },
  );
  params.deps.reportProgress?.(
    `hyper-pm: GitHub inbound — comparing ${issues.length} issue(s) against local tickets…`,
  );

  let inboundCompared = 0;
  const reportInboundChunk = (total: number): void => {
    const rp = params.deps.reportProgress;
    if (
      !rp ||
      total === 0 ||
      (inboundCompared % 200 !== 0 && inboundCompared !== total)
    ) {
      return;
    }
    rp(
      `hyper-pm: GitHub inbound — scanned ${inboundCompared}/${total} issue(s)…`,
    );
  };

  for (const issue of issues) {
    inboundCompared += 1;
    reportInboundChunk(issues.length);
    if (isGithubListRowPullRequest(issue)) continue;
    const ghIssueNumber =
      typeof issue.number === "number" && Number.isFinite(issue.number)
        ? issue.number
        : undefined;
    if (ghIssueNumber === undefined || ghIssueNumber < 1) continue;
    if (!issue.body) continue;
    const id = parseHyperPmIdFromIssueBody(issue.body);
    if (!id) continue;
    const ticket = params.projection.tickets.get(id);
    if (!ticket || ticket.deleted) continue;

    if (ticket.githubIssueNumber === undefined) {
      const linkEvt: EventLine = {
        schema: 1,
        type: "GithubIssueLinked",
        id: `gh-link-inbound-${ticket.id}-${ghIssueNumber}`,
        ts,
        actor: githubInboundActorFromIssue(issue),
        payload: { ticketId: ticket.id, issueNumber: ghIssueNumber },
      };
      out.push(linkEvt);
      await appendEventLine(params.dataRoot, linkEvt, params.deps.clock);
      ticket.githubIssueNumber = ghIssueNumber;
    }
    const issueApiState =
      issue.state === "closed" ? ("closed" as const) : ("open" as const);
    const nextStatus = resolveTicketInboundStatus({
      issueState: issueApiState,
      currentStatus: ticket.status,
    });
    const desc = extractDescriptionBeforeFirstFence(issue.body);
    const ghTitle = (issue.title ?? "").replace(/^\[hyper-pm\]\s*/, "").trim();
    const nextAssignee = assigneeFromGithubIssue(issue);
    const nextLabels = ticketLabelsFromGithubIssueLabels(issue.labels);
    const labelsMatch = ticketLabelListsEqual(ticket.labels, nextLabels);

    const firstFence = parseHyperPmFenceObject(issue.body) ?? {};
    const ticketFence = parseHyperPmTicketFenceObject(issue.body);
    const meta =
      ticketFence !== undefined
        ? { ...firstFence, ...ticketFence }
        : firstFence;
    const planningSource = inboundTicketPlanningPayloadFromFenceMeta(meta);
    const planningPayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(planningSource)) {
      if (k === "dependsOn") {
        if (v === null) {
          if (!ticketDependsOnListsEqual(ticket.dependsOn, [])) {
            planningPayload["dependsOn"] = null;
          }
        } else if (Array.isArray(v)) {
          const parsed = parseTicketDependsOnFromPayloadValue(v);
          if (
            parsed !== undefined &&
            !ticketDependsOnListsEqual(ticket.dependsOn, parsed)
          ) {
            planningPayload["dependsOn"] = parsed;
          }
        }
        continue;
      }
      const tk = k as keyof TicketRecord;
      const cur = ticket[tk];
      if (v === null) {
        if (cur !== undefined) {
          planningPayload[k] = null;
        }
      } else if (cur !== v) {
        planningPayload[k] = v;
      }
    }

    const titleDiff = ticket.title !== ghTitle;
    const bodyDiff = ticket.body !== desc;
    const statusDiff = ticket.status !== nextStatus;
    const assigneeDiff = ticket.assignee !== nextAssignee;
    const planningDiff = Object.keys(planningPayload).length > 0;

    if (
      !titleDiff &&
      !bodyDiff &&
      !statusDiff &&
      !assigneeDiff &&
      labelsMatch &&
      !planningDiff
    ) {
      continue;
    }

    const payload: Record<string, unknown> = {
      entity: "ticket",
      entityId: id,
    };
    if (titleDiff) {
      payload["title"] = ghTitle;
    }
    if (bodyDiff) {
      payload["body"] = desc;
    }
    if (statusDiff) {
      payload["status"] = nextStatus;
    }
    if (assigneeDiff) {
      payload["assignee"] = nextAssignee === undefined ? null : nextAssignee;
    }
    if (!labelsMatch) {
      payload["labels"] = nextLabels;
    }
    Object.assign(payload, planningPayload);

    const evt: EventLine = {
      schema: 1,
      type: "GithubInboundUpdate",
      id: `in-${id}-${issue.id}`,
      ts,
      actor: githubInboundActorFromIssue(issue),
      payload,
    };
    out.push(evt);
    await appendEventLine(params.dataRoot, evt, params.deps.clock);
  }
  return out;
};

/**
 * Resolves `owner/repo` from config, then `GITHUB_REPO`, then an optional git-derived slug.
 *
 * @param config - Persisted CLI configuration.
 * @param envRepo - Optional `GITHUB_REPO` value.
 * @param gitDerivedSlug - Optional `owner/repo` parsed from `git remote get-url` (github.com only).
 */
export const resolveGithubRepo = (
  config: HyperPmConfig,
  envRepo: string | undefined,
  gitDerivedSlug?: string,
): { owner: string; repo: string } => {
  const raw = config.githubRepo ?? envRepo ?? gitDerivedSlug;
  if (!raw) {
    throw new Error(
      "githubRepo missing (config, GITHUB_REPO, or a github.com URL on the configured git remote).",
    );
  }
  return parseRepo(raw);
};

/**
 * Reloads projection from disk after sync mutations.
 *
 * @param dataRoot - Data branch checkout root.
 */
export const loadProjectionFromDataRoot = async (
  dataRoot: string,
): Promise<Projection> => {
  const lines = await readAllEventLines(dataRoot);
  return replayEvents(lines);
};
