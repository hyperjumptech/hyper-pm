import { Octokit } from "@octokit/rest";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { buildGithubIssueBody, parseHyperPmIdFromIssueBody } from "../lib/github-issue-body";
import type { EventLine } from "../storage/event-line";
import { appendEventLine } from "../storage/append-event";
import type { Projection } from "../storage/projection";
import { replayEvents } from "../storage/projection";
import { readAllEventLines } from "../storage/read-event-lines";

export type GithubSyncDeps = {
  octokit: Octokit;
  owner: string;
  repo: string;
  clock: { now: () => Date };
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
  const actor = "hyper-pm-sync";
  const ts = params.deps.clock.now().toISOString();
  for (const ticket of params.projection.tickets.values()) {
    if (ticket.deleted) continue;
    const story = params.projection.stories.get(ticket.storyId);
    if (!story || story.deleted) continue;
    const epic = params.projection.epics.get(story.epicId);
    if (!epic || epic.deleted) continue;
    if (ticket.githubIssueNumber !== undefined) {
      await params.deps.octokit.rest.issues.update({
        owner: params.deps.owner,
        repo: params.deps.repo,
        issue_number: ticket.githubIssueNumber,
        title: `[hyper-pm] ${ticket.title}`,
        body: buildGithubIssueBody({
          hyperPmId: ticket.id,
          type: "ticket",
          parentIds: { epic: epic.id, story: story.id },
          description: ticket.body,
        }),
        state: ticket.state === "closed" ? "closed" : "open",
      });
      continue;
    }
    const created = await params.deps.octokit.rest.issues.create({
      owner: params.deps.owner,
      repo: params.deps.repo,
      title: `[hyper-pm] ${ticket.title}`,
      body: buildGithubIssueBody({
        hyperPmId: ticket.id,
        type: "ticket",
        parentIds: { epic: epic.id, story: story.id },
        description: ticket.body,
      }),
      labels: ["hyper-pm", "ticket"],
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
 * Minimum inbound sync: title/body/state for issues referencing hyper_pm ids.
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
  const actor = "hyper-pm-inbound";
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
    const nextState = issue.state === "closed" ? "closed" : "open";
    const fenceIdx = issue.body.indexOf("```");
    const desc =
      fenceIdx === -1
        ? issue.body.trim()
        : issue.body.slice(0, fenceIdx).trim();
    const ghTitle = (issue.title ?? "").replace(/^\[hyper-pm\]\s*/, "").trim();
    if (
      ticket.title === ghTitle &&
      ticket.body === desc &&
      ticket.state === nextState
    ) {
      continue;
    }
    const evt: EventLine = {
      schema: 1,
      type: "GithubInboundUpdate",
      id: `in-${id}-${issue.id}`,
      ts,
      actor,
      payload: {
        entity: "ticket",
        entityId: id,
        title: ghTitle,
        body: desc,
        state: nextState,
      },
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
