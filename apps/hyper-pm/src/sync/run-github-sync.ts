import { Octokit } from "@octokit/rest";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { assigneeFromGithubIssue } from "../lib/github-assignee";
import {
  buildGithubIssueBody,
  extractDescriptionBeforeFirstFence,
  inboundTicketPlanningPayloadFromFenceMeta,
  parseHyperPmFenceObject,
  parseHyperPmIdFromIssueBody,
  ticketPlanningForGithubIssueBody,
} from "../lib/github-issue-body";
import {
  mergeOutboundGithubIssueLabelsForTicket,
  ticketLabelsFromGithubIssueLabels,
} from "../lib/github-issue-labels";
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
};

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

  for (const ticket of params.projection.tickets.values()) {
    if (ticket.deleted) continue;
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
      continue;
    }
    if (parents === undefined) {
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
 * Minimum inbound sync: title/body/status for issues referencing hyper_pm ids.
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

  const issues = await params.deps.octokit.paginate(
    params.deps.octokit.rest.issues.listForRepo,
    {
      owner: params.deps.owner,
      repo: params.deps.repo,
      state: "all",
      per_page: 100,
    },
  );

  for (const issue of issues) {
    if (!issue.body) continue;
    const id = parseHyperPmIdFromIssueBody(issue.body);
    if (!id) continue;
    const ticket = params.projection.tickets.get(id);
    if (!ticket || ticket.deleted) continue;
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

    const meta = parseHyperPmFenceObject(issue.body) ?? {};
    const planningSource = inboundTicketPlanningPayloadFromFenceMeta(meta);
    const planningPayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(planningSource)) {
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
 * Resolves `owner/repo` from config first, falling back to typed `env.GITHUB_REPO`.
 *
 * @param config - Persisted CLI configuration.
 * @param envRepo - Optional `GITHUB_REPO` value.
 */
export const resolveGithubRepo = (
  config: HyperPmConfig,
  envRepo: string | undefined,
): { owner: string; repo: string } => {
  const raw = config.githubRepo ?? envRepo;
  if (!raw) {
    throw new Error("githubRepo missing (config or GITHUB_REPO).");
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
