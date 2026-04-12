#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@workspace/env";
import { Command } from "commander";
import { Octokit } from "@octokit/rest";
import { ulid } from "ulid";
import { runAiDraft } from "./ai/run-ai-draft";
import { ExitCode, type ExitCodeValue } from "./cli/exit-codes";
import { normalizeGithubLogin } from "./lib/github-assignee";
import {
  parseWorkItemStatus,
  type WorkItemStatus,
} from "./lib/work-item-status";
import { formatOutput } from "./cli/format-output";
import { resolveCliActor } from "./cli/resolve-cli-actor";
import { formatAuditTextLines, runAuditOnLines } from "./cli/run-audit";
import {
  listActiveEpicSummaries,
  listActiveStorySummaries,
  listActiveTicketSummaries,
} from "./cli/list-projection-summaries";
import {
  tryParseIsoDateMillis,
  type TicketListQuery,
} from "./cli/ticket-list-query";
import {
  hyperPmConfigSchema,
  type HyperPmConfig,
} from "./config/hyper-pm-config";
import { loadHyperPmConfig } from "./config/load-config";
import { saveHyperPmConfig } from "./config/save-config";
import { runDoctorOnLines } from "./doctor/run-doctor";
import { openDataBranchWorktree } from "./git/data-worktree-session";
import { findGitRoot } from "./git/find-git-root";
import { initOrphanDataBranchInWorktree } from "./git/init-orphan-data-branch";
import { runGit } from "./git/run-git";
import {
  commitDataWorktreeIfNeeded,
  formatDataBranchCommitMessage,
} from "./run/commit-data";
import { appendEventLine } from "./storage/append-event";
import type { EventLine, EventType } from "./storage/event-line";
import { eventTypeSchema } from "./storage/event-line";
import { readAllEventLines } from "./storage/read-event-lines";
import { replayEvents } from "./storage/projection";
import {
  defaultGithubPrActivitySyncDeps,
  runGithubPrActivitySync,
} from "./sync/run-github-pr-activity-sync";
import {
  loadProjectionFromDataRoot,
  resolveGithubRepo,
  runGithubInboundSync,
  runGithubOutboundSync,
} from "./sync/run-github-sync";
import { resolveGithubTokenActor } from "./sync/resolve-github-token-actor";
import { resolveGithubTokenForSync } from "./sync/resolve-github-token-for-sync";

type GlobalOpts = {
  format: "json" | "text";
  tempDir?: string;
  keepWorktree: boolean;
  repo?: string;
  dataBranch?: string;
  remote?: string;
  sync?: string;
  githubRepo?: string;
  /** Overrides env and git-derived identity for JSONL `actor` on mutations. */
  actor?: string;
};

const readGlobals = (cmd: Command): GlobalOpts => {
  let root: Command = cmd;
  while (root.parent) {
    root = root.parent;
  }
  return root.opts() as GlobalOpts;
};

/**
 * Parses `--status` when present, or exits on invalid values.
 *
 * @param raw - Raw CLI flag value.
 * @param deps - Process boundary for user-facing errors.
 * @returns Parsed status, or `undefined` when `raw` is `undefined`.
 */
const parseCliWorkItemStatus = (
  raw: string | undefined,
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): WorkItemStatus | undefined => {
  if (raw === undefined) return undefined;
  const s = parseWorkItemStatus(raw);
  if (s === undefined) {
    deps.error(
      `Invalid --status ${JSON.stringify(raw)} (expected backlog|todo|in_progress|done|cancelled)`,
    );
    deps.exit(ExitCode.UserError);
  }
  return s;
};

/**
 * Coerces a Commander option into a string array (repeatable flags may yield `string` or `string[]`).
 *
 * @param value - Raw option value from `this.opts()`.
 * @returns A new array of string tokens (possibly empty).
 */
const normalizeCliStringList = (
  value: string | string[] | undefined,
): string[] => {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

/**
 * Parses an optional ISO-8601 instant for ticket list filters; exits when non-empty input is invalid.
 *
 * @param raw - Flag value (omit or empty to skip the bound).
 * @param flagName - Flag label for error messages (e.g. `--created-after`).
 * @param deps - Process boundary for user-facing errors.
 * @returns Epoch milliseconds, or `undefined` when `raw` is absent or empty.
 */
const parseCliOptionalIsoMillis = (
  raw: string | undefined,
  flagName: string,
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): number | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const ms = tryParseIsoDateMillis(raw);
  if (ms === null) {
    deps.error(
      `Invalid ${flagName} ${JSON.stringify(raw)} (expected a parseable ISO-8601 date/time)`,
    );
    deps.exit(ExitCode.UserError);
  }
  return ms;
};

/**
 * Parses repeated `--status` tokens into workflow statuses, exiting on the first invalid token.
 *
 * @param raws - Non-empty list of raw status strings.
 * @param deps - Process boundary for user-facing errors.
 * @returns Parsed statuses in input order.
 */
const parseCliWorkItemStatusList = (
  raws: readonly string[],
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): WorkItemStatus[] => {
  const out: WorkItemStatus[] = [];
  for (const raw of raws) {
    const s = parseWorkItemStatus(raw);
    if (s === undefined) {
      deps.error(
        `Invalid --status ${JSON.stringify(raw)} (expected backlog|todo|in_progress|done|cancelled)`,
      );
      deps.exit(ExitCode.UserError);
    }
    out.push(s);
  }
  return out;
};

/**
 * Builds a {@link TicketListQuery} from raw `ticket read` list flags, or `undefined` when no filters apply.
 *
 * @param o - Parsed CLI options for listing-only flags.
 * @param deps - Process boundary for user-facing errors (invalid dates or statuses).
 * @returns Query object, or `undefined` when every advanced dimension is unset.
 */
const buildTicketListQueryFromReadListOpts = (
  o: {
    status?: string | string[];
    epic?: string;
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    statusChangedAfter?: string;
    statusChangedBefore?: string;
    createdBy?: string;
    updatedBy?: string;
    statusChangedBy?: string;
    titleContains?: string;
    githubLinked?: boolean;
  },
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): TicketListQuery | undefined => {
  const query: TicketListQuery = {};
  const statusTokens = normalizeCliStringList(o.status);
  if (statusTokens.length > 0) {
    query.statuses = parseCliWorkItemStatusList(statusTokens, deps);
  }
  if (o.epic !== undefined && o.epic !== "") {
    query.epicId = o.epic;
  }
  const createdAfterMs = parseCliOptionalIsoMillis(
    o.createdAfter,
    "--created-after",
    deps,
  );
  if (createdAfterMs !== undefined) {
    query.createdAfterMs = createdAfterMs;
  }
  const createdBeforeMs = parseCliOptionalIsoMillis(
    o.createdBefore,
    "--created-before",
    deps,
  );
  if (createdBeforeMs !== undefined) {
    query.createdBeforeMs = createdBeforeMs;
  }
  const updatedAfterMs = parseCliOptionalIsoMillis(
    o.updatedAfter,
    "--updated-after",
    deps,
  );
  if (updatedAfterMs !== undefined) {
    query.updatedAfterMs = updatedAfterMs;
  }
  const updatedBeforeMs = parseCliOptionalIsoMillis(
    o.updatedBefore,
    "--updated-before",
    deps,
  );
  if (updatedBeforeMs !== undefined) {
    query.updatedBeforeMs = updatedBeforeMs;
  }
  const statusChangedAfterMs = parseCliOptionalIsoMillis(
    o.statusChangedAfter,
    "--status-changed-after",
    deps,
  );
  if (statusChangedAfterMs !== undefined) {
    query.statusChangedAfterMs = statusChangedAfterMs;
  }
  const statusChangedBeforeMs = parseCliOptionalIsoMillis(
    o.statusChangedBefore,
    "--status-changed-before",
    deps,
  );
  if (statusChangedBeforeMs !== undefined) {
    query.statusChangedBeforeMs = statusChangedBeforeMs;
  }
  if (o.createdBy !== undefined && o.createdBy !== "") {
    query.createdByContains = o.createdBy;
  }
  if (o.updatedBy !== undefined && o.updatedBy !== "") {
    query.updatedByContains = o.updatedBy;
  }
  if (o.statusChangedBy !== undefined && o.statusChangedBy !== "") {
    query.statusChangedByContains = o.statusChangedBy;
  }
  if (o.titleContains !== undefined && o.titleContains !== "") {
    query.titleContainsLower = o.titleContains.toLowerCase();
  }
  if (o.githubLinked === true) {
    query.githubLinkedOnly = true;
  }
  return Object.keys(query).length > 0 ? query : undefined;
};

/**
 * Entry point for the hyper-pm CLI (commands, flags-only, non-interactive).
 *
 * @param argv - Raw argv from the host process.
 * @param deps - Injectable collaborators (tests supply fakes).
 */
export const runCli = async (
  argv: string[],
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
    clock: { now: () => Date };
  } = {
    exit: (code) => process.exit(code) as never,
    log: console.log,
    error: console.error,
    clock: { now: () => new Date() },
  },
): Promise<void> => {
  const program = new Command();

  program
    .name("hyper-pm")
    .description("Git-native PM CLI")
    .option("--format <fmt>", "output format", "json")
    .option("--temp-dir <dir>", "parent directory for disposable worktrees")
    .option("--keep-worktree", "skip worktree cleanup", false)
    .option("--repo <path>", "path to target git repository")
    .option("--data-branch <name>", "override data branch name (config/init)")
    .option("--remote <name>", "override remote name (init/config)")
    .option("--sync <mode>", "off|outbound|full")
    .option("--github-repo <owner/repo>", "override GitHub slug")
    .option(
      "--actor <label>",
      "audit actor for CLI mutations (overrides HYPER_PM_ACTOR)",
    );

  program.hook("preAction", (thisCommand) => {
    const fmt = thisCommand.getOptionValue("format");
    if (fmt !== "json" && fmt !== "text") {
      deps.error(`Invalid --format ${String(fmt)}`);
      deps.exit(ExitCode.UserError);
    }
  });

  program
    .command("init")
    .description("Create or adopt the orphan data branch")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
      const repoRoot = await resolveRepoRoot(g.repo);
      const dataBranch = g.dataBranch ?? "hyper-pm-data";
      const remote = g.remote ?? "origin";
      const branchExists = await branchRefExists(repoRoot, dataBranch, runGit);
      if (!branchExists) {
        const wt = join(tmpBase, `hyper-pm-init-${ulid().toLowerCase()}`);
        await mkdir(tmpBase, { recursive: true });
        try {
          await initOrphanDataBranchInWorktree({
            repoRoot,
            worktreePath: wt,
            dataBranch,
            runGit,
          });
        } finally {
          if (!g.keepWorktree) {
            await runGit(repoRoot, ["worktree", "remove", "--force", wt]).catch(
              () => {},
            );
          }
        }
      }
      const config: HyperPmConfig = {
        schema: 1,
        dataBranch,
        remote,
        sync: "outbound",
        issueMapping: "ticket",
        githubRepo: g.githubRepo ?? env.GITHUB_REPO,
      };
      await saveHyperPmConfig(
        repoRoot,
        hyperPmConfigSchema.parse({ ...config, ...cliConfigSlice(g) }),
      );
      deps.log(
        formatOutput(g.format, {
          ok: true,
          dataBranch,
          configPath: `${repoRoot}/.hyper-pm/config.json`,
        }),
      );
      deps.exit(ExitCode.Success);
    });

  const epic = program.command("epic");
  epic
    .command("create")
    .requiredOption("--title <t>", "title")
    .option("--body <b>", "body", "")
    .option("--id <id>", "explicit id")
    .option(
      "--status <s>",
      "backlog|todo|in_progress|done|cancelled (default backlog)",
    )
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        title: string;
        body: string;
        id?: string;
        status?: string;
      }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const id = o.id ?? ulid();
        const status = parseCliWorkItemStatus(o.status, deps);
        const evt = makeEvent(
          "EpicCreated",
          {
            id,
            title: o.title,
            body: o.body,
            ...(status !== undefined ? { status } : {}),
          },
          deps.clock,
          actor,
        );
        await appendEventLine(root, evt, deps.clock);
        return evt.payload;
      });
    });
  epic
    .command("read")
    .description("Show one epic or list all when --id is omitted")
    .option("--id <id>", "epic id; omit to list")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id?: string }>();
      await readEpic(g, o.id, deps);
    });
  epic
    .command("update")
    .requiredOption("--id <id>", "id")
    .option("--title <t>")
    .option("--body <b>")
    .option("--status <s>", "backlog|todo|in_progress|done|cancelled")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        id: string;
        title?: string;
        body?: string;
        status?: string;
      }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const status = parseCliWorkItemStatus(o.status, deps);
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (o.body !== undefined) payload["body"] = o.body;
        if (status !== undefined) payload["status"] = status;
        const evt = makeEvent("EpicUpdated", payload, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return payload;
      });
    });
  epic
    .command("delete")
    .requiredOption("--id <id>", "id")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const evt = makeEvent("EpicDeleted", { id: o.id }, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return { id: o.id, deleted: true };
      });
    });

  const story = program.command("story");
  story
    .command("create")
    .requiredOption("--title <t>")
    .requiredOption("--epic <id>")
    .option("--body <b>", "", "")
    .option("--id <id>")
    .option(
      "--status <s>",
      "backlog|todo|in_progress|done|cancelled (default backlog)",
    )
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        title: string;
        body: string;
        epic: string;
        id?: string;
        status?: string;
      }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        const epic = proj.epics.get(o.epic);
        if (!epic || epic.deleted) {
          throw new Error(`Epic not found: ${o.epic}`);
        }
        const id = o.id ?? ulid();
        const status = parseCliWorkItemStatus(o.status, deps);
        const evt = makeEvent(
          "StoryCreated",
          {
            id,
            epicId: o.epic,
            title: o.title,
            body: o.body,
            ...(status !== undefined ? { status } : {}),
          },
          deps.clock,
          actor,
        );
        await appendEventLine(root, evt, deps.clock);
        return evt.payload;
      });
    });
  story
    .command("read")
    .description("Show one story or list all when --id is omitted")
    .option("--id <id>", "story id; omit to list")
    .option(
      "--epic <id>",
      "when listing (no --id), only stories under this epic",
    )
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id?: string; epic?: string }>();
      await readStory(g, { id: o.id, epicId: o.epic }, deps);
    });
  story
    .command("update")
    .requiredOption("--id <id>")
    .option("--title <t>")
    .option("--body <b>")
    .option("--status <s>", "backlog|todo|in_progress|done|cancelled")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        id: string;
        title?: string;
        body?: string;
        status?: string;
      }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const status = parseCliWorkItemStatus(o.status, deps);
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (o.body !== undefined) payload["body"] = o.body;
        if (status !== undefined) payload["status"] = status;
        const evt = makeEvent("StoryUpdated", payload, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return payload;
      });
    });
  story
    .command("delete")
    .requiredOption("--id <id>")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const evt = makeEvent("StoryDeleted", { id: o.id }, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return { id: o.id, deleted: true };
      });
    });

  const ticket = program.command("ticket");
  ticket
    .command("create")
    .requiredOption("--title <t>")
    .requiredOption("--story <id>")
    .option("--body <b>", "", "")
    .option("--id <id>")
    .option(
      "--status <s>",
      "backlog|todo|in_progress|done|cancelled (default todo)",
    )
    .option(
      "--assignee <login>",
      "optional GitHub login for the assignee (normalized)",
    )
    .option("--ai-draft", "draft body via AI (explicit)", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        title: string;
        body: string;
        story: string;
        id?: string;
        status?: string;
        assignee?: string;
        aiDraft?: boolean;
      }>();
      let body = o.body;
      if (o.aiDraft) {
        if (!env.HYPER_PM_AI_API_KEY) {
          deps.error("HYPER_PM_AI_API_KEY required for --ai-draft");
          deps.exit(ExitCode.EnvironmentAuth);
        }
        body = await runAiDraft({
          apiKey: env.HYPER_PM_AI_API_KEY,
          prompt: `Draft acceptance-style body for ticket titled: ${o.title}`,
        });
      }
      if (o.assignee !== undefined && normalizeGithubLogin(o.assignee) === "") {
        deps.error("--assignee must be a non-empty login");
        deps.exit(ExitCode.UserError);
      }
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        const storyRow = proj.stories.get(o.story);
        if (!storyRow || storyRow.deleted) {
          throw new Error(`Story not found: ${o.story}`);
        }
        const id = o.id ?? ulid();
        const status = parseCliWorkItemStatus(o.status, deps);
        const assigneeCreate =
          o.assignee !== undefined
            ? { assignee: normalizeGithubLogin(o.assignee) }
            : {};
        const evt = makeEvent(
          "TicketCreated",
          {
            id,
            storyId: o.story,
            title: o.title,
            body,
            ...(status !== undefined ? { status } : {}),
            ...assigneeCreate,
          },
          deps.clock,
          actor,
        );
        await appendEventLine(root, evt, deps.clock);
        return evt.payload;
      });
    });
  ticket
    .command("read")
    .description("Show one ticket or list all when --id is omitted")
    .option("--id <id>", "ticket id; omit to list")
    .option(
      "--story <id>",
      "when listing (no --id), only tickets under this story",
    )
    .option(
      "--epic <id>",
      "when listing (no --id), only tickets whose story belongs to this epic (cannot combine with --story)",
    )
    .option(
      "--status <s>",
      "when listing (no --id): OR-set of statuses (repeat flag); backlog|todo|in_progress|done|cancelled",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--created-after <iso>",
      "when listing (no --id): inclusive lower bound on createdAt (ISO-8601)",
    )
    .option(
      "--created-before <iso>",
      "when listing (no --id): inclusive upper bound on createdAt (ISO-8601)",
    )
    .option(
      "--updated-after <iso>",
      "when listing (no --id): inclusive lower bound on updatedAt (ISO-8601)",
    )
    .option(
      "--updated-before <iso>",
      "when listing (no --id): inclusive upper bound on updatedAt (ISO-8601)",
    )
    .option(
      "--status-changed-after <iso>",
      "when listing (no --id): inclusive lower bound on statusChangedAt (ISO-8601)",
    )
    .option(
      "--status-changed-before <iso>",
      "when listing (no --id): inclusive upper bound on statusChangedAt (ISO-8601)",
    )
    .option(
      "--created-by <text>",
      "when listing (no --id): substring match on createdBy (case-sensitive)",
    )
    .option(
      "--updated-by <text>",
      "when listing (no --id): substring match on updatedBy (case-sensitive)",
    )
    .option(
      "--status-changed-by <text>",
      "when listing (no --id): substring match on statusChangedBy (case-sensitive)",
    )
    .option(
      "--title-contains <text>",
      "when listing (no --id): case-insensitive substring match on title",
    )
    .option(
      "--github-linked",
      "when listing (no --id): only tickets with a linked GitHub issue number",
      false,
    )
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        id?: string;
        story?: string;
        epic?: string;
        status?: string | string[];
        createdAfter?: string;
        createdBefore?: string;
        updatedAfter?: string;
        updatedBefore?: string;
        statusChangedAfter?: string;
        statusChangedBefore?: string;
        createdBy?: string;
        updatedBy?: string;
        statusChangedBy?: string;
        titleContains?: string;
        githubLinked?: boolean;
      }>();
      await readTicket(g, o, deps);
    });
  ticket
    .command("update")
    .requiredOption("--id <id>")
    .option("--title <t>")
    .option("--body <b>")
    .option("--status <s>", "backlog|todo|in_progress|done|cancelled")
    .option(
      "--assignee <login>",
      "set assignee to this GitHub login (normalized)",
    )
    .option("--unassign", "remove the ticket assignee", false)
    .option("--ai-improve", "expand description via AI (explicit)", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        id: string;
        title?: string;
        body?: string;
        status?: string;
        assignee?: string;
        unassign?: boolean;
        aiImprove?: boolean;
      }>();
      let body = o.body;
      if (o.aiImprove) {
        if (!env.HYPER_PM_AI_API_KEY) {
          deps.error("HYPER_PM_AI_API_KEY required for --ai-improve");
          deps.exit(ExitCode.EnvironmentAuth);
        }
        if (!body) {
          deps.error("--body required as baseline for --ai-improve");
          deps.exit(ExitCode.UserError);
        }
        body = await runAiDraft({
          apiKey: env.HYPER_PM_AI_API_KEY,
          prompt: `Improve this ticket body:\n${body}`,
        });
      }
      if (o.assignee !== undefined && o.unassign) {
        deps.error("Cannot use --assignee and --unassign together");
        deps.exit(ExitCode.UserError);
      }
      if (o.assignee !== undefined && normalizeGithubLogin(o.assignee) === "") {
        deps.error("--assignee must be a non-empty login");
        deps.exit(ExitCode.UserError);
      }
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const status = parseCliWorkItemStatus(o.status, deps);
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (body !== undefined) payload["body"] = body;
        if (status !== undefined) payload["status"] = status;
        if (o.unassign) {
          payload["assignee"] = null;
        } else if (o.assignee !== undefined) {
          payload["assignee"] = normalizeGithubLogin(o.assignee);
        }
        const evt = makeEvent("TicketUpdated", payload, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return payload;
      });
    });
  ticket
    .command("delete")
    .requiredOption("--id <id>")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string }>();
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const evt = makeEvent("TicketDeleted", { id: o.id }, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return { id: o.id, deleted: true };
      });
    });

  program
    .command("sync")
    .description("GitHub Issues sync")
    .option("--no-github", "skip network sync", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ noGithub?: boolean }>();
      const repoRoot = await resolveRepoRoot(g.repo);
      const cfg = await loadMergedConfig(repoRoot, g);
      if (cfg.sync === "off" || o.noGithub) {
        deps.log(formatOutput(g.format, { ok: true, skipped: true }));
        deps.exit(ExitCode.Success);
      }
      const githubToken = await resolveGithubTokenForSync({
        envToken: env.GITHUB_TOKEN,
        cwd: repoRoot,
      });
      if (!githubToken) {
        deps.error(
          "GitHub auth required for sync: set GITHUB_TOKEN or run `gh auth login`",
        );
        deps.exit(ExitCode.EnvironmentAuth);
      }
      const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
      const session = await openDataBranchWorktree({
        repoRoot,
        dataBranch: cfg.dataBranch,
        tmpBase,
        keepWorktree: g.keepWorktree,
        runGit,
      });
      try {
        const projection = await loadProjectionFromDataRoot(
          session.worktreePath,
        );
        const { owner, repo } = resolveGithubRepo(cfg, env.GITHUB_REPO);
        const octokit = new Octokit({ auth: githubToken });
        const outboundActor = await resolveGithubTokenActor(octokit);
        const depsGh = {
          octokit,
          owner,
          repo,
          clock: deps.clock,
          outboundActor,
        };
        await runGithubOutboundSync({
          dataRoot: session.worktreePath,
          projection,
          config: cfg,
          deps: depsGh,
        });
        await runGithubInboundSync({
          dataRoot: session.worktreePath,
          projection,
          config: cfg,
          deps: depsGh,
        });
        const projectionAfterInbound = await loadProjectionFromDataRoot(
          session.worktreePath,
        );
        await runGithubPrActivitySync({
          projection: projectionAfterInbound,
          config: cfg,
          deps: defaultGithubPrActivitySyncDeps({
            dataRoot: session.worktreePath,
            clock: deps.clock,
            octokit,
            owner,
            repo,
            actor: outboundActor,
          }),
        });
        await commitDataWorktreeIfNeeded(
          session.worktreePath,
          formatDataBranchCommitMessage("hyper-pm: sync", outboundActor),
          runGit,
        );
        deps.log(formatOutput(g.format, { ok: true }));
      } catch (e) {
        deps.error(e instanceof Error ? e.message : String(e));
        deps.exit(ExitCode.ExternalApi);
      } finally {
        await session.dispose();
      }
      deps.exit(ExitCode.Success);
    });

  program
    .command("audit")
    .description(
      "List durable events (who / what / when) with optional filters",
    )
    .option(
      "--limit <n>",
      "keep only the most recent n matching events",
      (raw) => {
        const n = Number.parseInt(String(raw), 10);
        return Number.isNaN(n) ? undefined : n;
      },
    )
    .option("--type <t>", "filter by event type (e.g. TicketUpdated)")
    .option(
      "--entity-id <id>",
      "filter rows whose payload id, entityId, or ticketId matches",
    )
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        limit?: number;
        type?: string;
        entityId?: string;
      }>();
      let filterType: EventType | undefined;
      if (o.type !== undefined && o.type !== "") {
        const parsed = eventTypeSchema.safeParse(o.type);
        if (!parsed.success) {
          deps.error(`Invalid --type: ${o.type}`);
          deps.exit(ExitCode.UserError);
        }
        filterType = parsed.data;
      }
      try {
        const repoRoot = await resolveRepoRoot(g.repo);
        const cfg = await loadMergedConfig(repoRoot, g);
        const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
        const session = await openDataBranchWorktree({
          repoRoot,
          dataBranch: cfg.dataBranch,
          tmpBase,
          keepWorktree: g.keepWorktree,
          runGit,
        });
        try {
          const lines = await readAllEventLines(session.worktreePath);
          const { events, invalidLines } = runAuditOnLines(lines, {
            type: filterType,
            entityId: o.entityId,
            limit: o.limit,
          });
          if (invalidLines.length > 0) {
            deps.error(
              `audit: skipped ${invalidLines.length} invalid JSONL line(s)`,
            );
          }
          if (g.format === "json") {
            deps.log(
              formatOutput(g.format, {
                ok: true,
                events,
                invalidLines,
              }),
            );
          } else {
            deps.log(formatAuditTextLines(events));
          }
        } finally {
          await session.dispose();
        }
      } catch (e) {
        deps.error(e instanceof Error ? e.message : String(e));
        deps.exit(ExitCode.UserError);
      }
      deps.exit(ExitCode.Success);
    });

  program
    .command("doctor")
    .description("Validate local event log readability")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const repoRoot = await resolveRepoRoot(g.repo);
      const cfg = await loadMergedConfig(repoRoot, g);
      const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
      const session = await openDataBranchWorktree({
        repoRoot,
        dataBranch: cfg.dataBranch,
        tmpBase,
        keepWorktree: g.keepWorktree,
        runGit,
      });
      try {
        const lines = await readAllEventLines(session.worktreePath);
        const issues = runDoctorOnLines(lines);
        if (issues.length > 0) {
          deps.log(formatOutput(g.format, { ok: false, issues }));
          deps.exit(ExitCode.CorruptData);
        }
        deps.log(formatOutput(g.format, { ok: true }));
        deps.exit(ExitCode.Success);
      } finally {
        await session.dispose();
      }
    });

  await program.parseAsync(argv, { from: "node" });
};

/**
 * Builds a validated-shaped event line for append-only storage.
 *
 * @param type - Durable event discriminator.
 * @param payload - Type-specific fields.
 * @param clock - Injectable clock (tests use fixed times).
 * @param actor - Resolved audit identity (CLI, sync, etc.).
 */
const makeEvent = (
  type: EventType,
  payload: Record<string, unknown>,
  clock: { now: () => Date },
  actor: string,
): EventLine => ({
  schema: 1,
  type,
  id: ulid(),
  ts: clock.now().toISOString(),
  actor,
  payload,
});

const resolveRepoRoot = async (repoFlag?: string): Promise<string> => {
  const start = repoFlag ?? process.cwd();
  if (repoFlag && !existsSync(repoFlag)) {
    throw new Error(`--repo path not found: ${repoFlag}`);
  }
  return findGitRoot(start, { runGit });
};

const branchRefExists = async (
  repoRoot: string,
  branch: string,
  git: typeof runGit,
): Promise<boolean> => {
  try {
    await git(repoRoot, ["show-ref", "--verify", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
};

const cliConfigSlice = (g: GlobalOpts): Partial<HyperPmConfig> => ({
  ...(g.sync === "off" || g.sync === "outbound" || g.sync === "full"
    ? { sync: g.sync }
    : {}),
  ...(g.githubRepo ? { githubRepo: g.githubRepo } : {}),
  ...(g.remote ? { remote: g.remote } : {}),
  ...(g.dataBranch ? { dataBranch: g.dataBranch } : {}),
});

const loadMergedConfig = async (
  repoRoot: string,
  g: GlobalOpts,
): Promise<HyperPmConfig> => {
  const overrides = cliConfigSlice(g);
  return loadHyperPmConfig(repoRoot, overrides);
};

const mutateDataBranch = async (
  g: GlobalOpts,
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
    clock: { now: () => Date };
  },
  fn: (
    dataRoot: string,
    ctx: { actor: string },
  ) => Promise<Record<string, unknown>>,
): Promise<void> => {
  try {
    const repoRoot = await resolveRepoRoot(g.repo);
    const actor = await resolveCliActor({
      repoRoot,
      cliActor: g.actor,
      envActor: env.HYPER_PM_ACTOR,
    });
    const cfg = await loadMergedConfig(repoRoot, g);
    const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
    const session = await openDataBranchWorktree({
      repoRoot,
      dataBranch: cfg.dataBranch,
      tmpBase,
      keepWorktree: g.keepWorktree,
      runGit,
    });
    try {
      const payload = await fn(session.worktreePath, { actor });
      await commitDataWorktreeIfNeeded(
        session.worktreePath,
        formatDataBranchCommitMessage("hyper-pm: mutation", actor),
        runGit,
      );
      deps.log(formatOutput(g.format, { ok: true, ...payload }));
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
  deps.exit(ExitCode.Success);
};

/**
 * Prints one epic by id, or all epic id/title rows when `id` is omitted or empty.
 *
 * @param g - Global CLI flags (repo, format, worktree, etc.).
 * @param id - Epic id, or omit for list mode.
 * @param deps - Injectable process boundary (log, error, exit).
 */
const readEpic = async (
  g: GlobalOpts,
  id: string | undefined,
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
  },
): Promise<void> => {
  let exitCode: ExitCodeValue = ExitCode.Success;
  try {
    const repoRoot = await resolveRepoRoot(g.repo);
    const cfg = await loadMergedConfig(repoRoot, g);
    const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
    const session = await openDataBranchWorktree({
      repoRoot,
      dataBranch: cfg.dataBranch,
      tmpBase,
      keepWorktree: g.keepWorktree,
      runGit,
    });
    try {
      const lines = await readAllEventLines(session.worktreePath);
      const proj = replayEvents(lines);
      if (id === undefined || id === "") {
        deps.log(
          formatOutput(g.format, { items: listActiveEpicSummaries(proj) }),
        );
      } else {
        const row = proj.epics.get(id);
        if (!row || row.deleted) {
          deps.error("Epic not found");
          exitCode = ExitCode.UserError;
        } else {
          deps.log(formatOutput(g.format, row));
        }
      }
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
  deps.exit(exitCode);
};

/**
 * Prints one story by id, or story list summaries when `id` is omitted or empty.
 *
 * When listing, optional `epicId` filters to stories under that epic (epic must exist).
 * `epicId` is ignored when `id` is set (single-story read).
 *
 * @param g - Global CLI flags (repo, format, worktree, etc.).
 * @param opts - `id` for one row; omit for list. `epicId` narrows the list when `id` is omitted.
 * @param deps - Injectable process boundary (log, error, exit).
 */
const readStory = async (
  g: GlobalOpts,
  opts: { id?: string; epicId?: string },
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
  },
): Promise<void> => {
  let exitCode: ExitCodeValue = ExitCode.Success;
  try {
    const repoRoot = await resolveRepoRoot(g.repo);
    const cfg = await loadMergedConfig(repoRoot, g);
    const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
    const session = await openDataBranchWorktree({
      repoRoot,
      dataBranch: cfg.dataBranch,
      tmpBase,
      keepWorktree: g.keepWorktree,
      runGit,
    });
    try {
      const lines = await readAllEventLines(session.worktreePath);
      const proj = replayEvents(lines);
      const { id, epicId } = opts;
      if (id === undefined || id === "") {
        const epicFilter =
          epicId !== undefined && epicId !== "" ? epicId : undefined;
        if (epicFilter !== undefined) {
          const epicRow = proj.epics.get(epicFilter);
          if (!epicRow || epicRow.deleted) {
            deps.error("Epic not found");
            exitCode = ExitCode.UserError;
          } else {
            deps.log(
              formatOutput(g.format, {
                items: listActiveStorySummaries(proj, {
                  epicId: epicFilter,
                }),
              }),
            );
          }
        } else {
          deps.log(
            formatOutput(g.format, { items: listActiveStorySummaries(proj) }),
          );
        }
      } else {
        const row = proj.stories.get(id);
        if (!row || row.deleted) {
          deps.error("Story not found");
          exitCode = ExitCode.UserError;
        } else {
          deps.log(formatOutput(g.format, row));
        }
      }
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
  deps.exit(exitCode);
};

/**
 * Prints one ticket by id, or ticket list summaries when `id` is omitted or empty.
 *
 * When listing, optional `story` filters to tickets under that story (story must exist).
 * Advanced list flags are ignored when `--id` is set. `--story` and `--epic` cannot be used together.
 *
 * @param g - Global CLI flags (repo, format, worktree, etc.).
 * @param opts - Parsed `ticket read` options (`id`, `story`, list-only filters).
 * @param deps - Injectable process boundary (log, error, exit).
 */
const readTicket = async (
  g: GlobalOpts,
  opts: {
    id?: string;
    story?: string;
    epic?: string;
    status?: string | string[];
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    statusChangedAfter?: string;
    statusChangedBefore?: string;
    createdBy?: string;
    updatedBy?: string;
    statusChangedBy?: string;
    titleContains?: string;
    githubLinked?: boolean;
  },
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
  },
): Promise<void> => {
  let exitCode: ExitCodeValue = ExitCode.Success;
  try {
    const repoRoot = await resolveRepoRoot(g.repo);
    const cfg = await loadMergedConfig(repoRoot, g);
    const tmpBase = g.tempDir ?? env.TMPDIR ?? tmpdir();
    const session = await openDataBranchWorktree({
      repoRoot,
      dataBranch: cfg.dataBranch,
      tmpBase,
      keepWorktree: g.keepWorktree,
      runGit,
    });
    try {
      const lines = await readAllEventLines(session.worktreePath);
      const proj = replayEvents(lines);
      const { id, story: storyIdRaw, epic: epicIdRaw, ...listFlagRest } = opts;
      if (id === undefined || id === "") {
        const storyFilter =
          storyIdRaw !== undefined && storyIdRaw !== ""
            ? storyIdRaw
            : undefined;
        const epicFilter =
          epicIdRaw !== undefined && epicIdRaw !== "" ? epicIdRaw : undefined;
        if (storyFilter !== undefined && epicFilter !== undefined) {
          deps.error(
            "Cannot use --story and --epic together when listing tickets",
          );
          exitCode = ExitCode.UserError;
        } else if (epicFilter !== undefined) {
          const epicRow = proj.epics.get(epicFilter);
          if (!epicRow || epicRow.deleted) {
            deps.error("Epic not found");
            exitCode = ExitCode.UserError;
          } else {
            const listQuery = buildTicketListQueryFromReadListOpts(
              { epic: epicFilter, ...listFlagRest },
              deps,
            );
            deps.log(
              formatOutput(g.format, {
                items: listActiveTicketSummaries(proj, {
                  query: listQuery,
                }),
              }),
            );
          }
        } else if (storyFilter !== undefined) {
          const storyRow = proj.stories.get(storyFilter);
          if (!storyRow || storyRow.deleted) {
            deps.error("Story not found");
            exitCode = ExitCode.UserError;
          } else {
            const listQuery = buildTicketListQueryFromReadListOpts(
              listFlagRest,
              deps,
            );
            deps.log(
              formatOutput(g.format, {
                items: listActiveTicketSummaries(proj, {
                  storyId: storyFilter,
                  query: listQuery,
                }),
              }),
            );
          }
        } else {
          const listQuery = buildTicketListQueryFromReadListOpts(
            { epic: epicFilter, ...listFlagRest },
            deps,
          );
          deps.log(
            formatOutput(g.format, {
              items: listActiveTicketSummaries(proj, { query: listQuery }),
            }),
          );
        }
      } else {
        const row = proj.tickets.get(id);
        if (!row || row.deleted) {
          deps.error("Ticket not found");
          exitCode = ExitCode.UserError;
        } else {
          deps.log(formatOutput(g.format, row));
        }
      }
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
  deps.exit(exitCode);
};
