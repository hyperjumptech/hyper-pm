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
  normalizeTicketBranchListFromStrings,
  normalizeTicketBranchName,
} from "./lib/normalize-ticket-branches";
import {
  normalizeTicketLabelList,
  ticketLabelListsEqual,
  tryParseTicketPriority,
  tryParseTicketSize,
  type TicketPriority,
  type TicketSize,
} from "./lib/ticket-planning-fields";
import {
  parseWorkItemStatus,
  type WorkItemStatus,
} from "./lib/work-item-status";
import { formatOutput } from "./cli/format-output";
import { resolveCliActor } from "./cli/resolve-cli-actor";
import {
  formatAuditPlainLines,
  parseAuditTextStyle,
} from "./cli/format-audit-plain-lines";
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
  TICKET_LIST_SORT_FIELDS,
  tryParseTicketListSortDir,
  tryParseTicketListSortField,
} from "./cli/ticket-list-sort";
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
 * Returns whether two branch name lists are identical (same length and pairwise `===`).
 *
 * @param a - First list (typically normalized).
 * @param b - Second list.
 */
const ticketBranchListsEqual = (
  a: readonly string[],
  b: readonly string[],
): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

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
 * Parses an optional ISO-8601 instant for ticket payloads; exits when non-empty input is invalid.
 *
 * @param raw - Flag value (omit or empty to skip).
 * @param flagName - Flag label for error messages.
 * @param deps - Process boundary for user-facing errors.
 * @returns Trimmed instant string, or `undefined` when `raw` is absent or empty.
 */
const parseCliOptionalIsoInstantString = (
  raw: string | undefined,
  flagName: string,
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): string | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const t = raw.trim();
  if (tryParseIsoDateMillis(t) === null) {
    deps.error(
      `Invalid ${flagName} ${JSON.stringify(raw)} (expected a parseable ISO-8601 date/time)`,
    );
    deps.exit(ExitCode.UserError);
  }
  return t;
};

/**
 * Parses an optional non-negative finite number for estimate bounds.
 *
 * @param raw - Flag value.
 * @param flagName - Flag label for errors.
 * @param deps - Process boundary for user-facing errors.
 */
const parseCliOptionalEstimateBound = (
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
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    deps.error(
      `Invalid ${flagName} ${JSON.stringify(raw)} (expected a non-negative finite number)`,
    );
    deps.exit(ExitCode.UserError);
  }
  return n;
};

/**
 * Parses repeated `--priority` list tokens for ticket list filters.
 *
 * @param raws - Non-empty raw strings.
 * @param deps - Process boundary for user-facing errors.
 */
const parseCliTicketPriorityList = (
  raws: readonly string[],
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): TicketPriority[] => {
  const out: TicketPriority[] = [];
  for (const raw of raws) {
    const p = tryParseTicketPriority(raw);
    if (p === undefined) {
      deps.error(
        `Invalid --priority ${JSON.stringify(raw)} (expected low|medium|high|urgent)`,
      );
      deps.exit(ExitCode.UserError);
    }
    out.push(p);
  }
  return out;
};

/**
 * Parses repeated `--size` list tokens for ticket list filters.
 *
 * @param raws - Non-empty raw strings.
 * @param deps - Process boundary for user-facing errors.
 */
const parseCliTicketSizeList = (
  raws: readonly string[],
  deps: {
    exit: (code: number) => never;
    error: typeof console.error;
  },
): TicketSize[] => {
  const out: TicketSize[] = [];
  for (const raw of raws) {
    const s = tryParseTicketSize(raw);
    if (s === undefined) {
      deps.error(
        `Invalid --size ${JSON.stringify(raw)} (expected xs|s|m|l|xl)`,
      );
      deps.exit(ExitCode.UserError);
    }
    out.push(s);
  }
  return out;
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
    /** When true, restrict to tickets with no story (`withoutStoryOnly`). */
    withoutStory?: boolean;
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
    /** When set and non-empty, normalized exact match on a linked branch. */
    branch?: string;
    priority?: string | string[];
    size?: string | string[];
    label?: string | string[];
    estimateMin?: string;
    estimateMax?: string;
    startAfter?: string;
    startBefore?: string;
    targetFinishAfter?: string;
    targetFinishBefore?: string;
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
  if (o.branch !== undefined && o.branch !== "") {
    const nb = normalizeTicketBranchName(o.branch);
    if (nb === undefined) {
      deps.error("--branch must be a non-empty valid branch name");
      deps.exit(ExitCode.UserError);
    }
    query.branchNormalized = nb;
  }
  if (o.withoutStory === true) {
    query.withoutStoryOnly = true;
  }

  const priorityTokens = normalizeCliStringList(o.priority);
  if (priorityTokens.length > 0) {
    query.priorities = parseCliTicketPriorityList(priorityTokens, deps);
  }
  const sizeTokens = normalizeCliStringList(o.size);
  if (sizeTokens.length > 0) {
    query.sizes = parseCliTicketSizeList(sizeTokens, deps);
  }
  const labelTokens = normalizeCliStringList(o.label);
  const labelsAll = labelTokens.map((x) => x.trim()).filter((x) => x !== "");
  if (labelsAll.length > 0) {
    query.labelsAll = labelsAll;
  }

  const estimateMin = parseCliOptionalEstimateBound(
    o.estimateMin,
    "--estimate-min",
    deps,
  );
  if (estimateMin !== undefined) {
    query.estimateMin = estimateMin;
  }
  const estimateMax = parseCliOptionalEstimateBound(
    o.estimateMax,
    "--estimate-max",
    deps,
  );
  if (estimateMax !== undefined) {
    query.estimateMax = estimateMax;
  }

  const startWorkAfterMs = parseCliOptionalIsoMillis(
    o.startAfter,
    "--start-after",
    deps,
  );
  if (startWorkAfterMs !== undefined) {
    query.startWorkAfterMs = startWorkAfterMs;
  }
  const startWorkBeforeMs = parseCliOptionalIsoMillis(
    o.startBefore,
    "--start-before",
    deps,
  );
  if (startWorkBeforeMs !== undefined) {
    query.startWorkBeforeMs = startWorkBeforeMs;
  }
  const targetFinishAfterMs = parseCliOptionalIsoMillis(
    o.targetFinishAfter,
    "--target-finish-after",
    deps,
  );
  if (targetFinishAfterMs !== undefined) {
    query.targetFinishAfterMs = targetFinishAfterMs;
  }
  const targetFinishBeforeMs = parseCliOptionalIsoMillis(
    o.targetFinishBefore,
    "--target-finish-before",
    deps,
  );
  if (targetFinishBeforeMs !== undefined) {
    query.targetFinishBeforeMs = targetFinishBeforeMs;
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
    .option(
      "--story <id>",
      "optional story id; omit to create an unlinked ticket",
    )
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
    .option(
      "--branch <name>",
      "link a git branch name (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--label <name>",
      "planning label (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option("--priority <p>", "low|medium|high|urgent")
    .option("--size <s>", "xs|s|m|l|xl")
    .option("--estimate <n>", "non-negative estimate (e.g. story points)")
    .option("--start-at <iso>", "planned start work at (ISO-8601)")
    .option("--target-finish-at <iso>", "planned target finish at (ISO-8601)")
    .option("--ai-draft", "draft body via AI (explicit)", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        title: string;
        body: string;
        story?: string;
        id?: string;
        status?: string;
        assignee?: string;
        branch?: string | string[];
        label?: string | string[];
        priority?: string;
        size?: string;
        estimate?: string;
        startAt?: string;
        targetFinishAt?: string;
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
      const labelTokensCreate = normalizeCliStringList(o.label);
      const labelsNormCreate = normalizeTicketLabelList(labelTokensCreate);
      const labelsPayloadCreate =
        labelsNormCreate.length > 0 ? { labels: labelsNormCreate } : {};
      let priorityParsed: TicketPriority | undefined;
      if (o.priority !== undefined && o.priority !== "") {
        priorityParsed = tryParseTicketPriority(o.priority);
        if (priorityParsed === undefined) {
          deps.error(
            `Invalid --priority ${JSON.stringify(o.priority)} (expected low|medium|high|urgent)`,
          );
          deps.exit(ExitCode.UserError);
        }
      }
      let sizeParsed: TicketSize | undefined;
      if (o.size !== undefined && o.size !== "") {
        sizeParsed = tryParseTicketSize(o.size);
        if (sizeParsed === undefined) {
          deps.error(
            `Invalid --size ${JSON.stringify(o.size)} (expected xs|s|m|l|xl)`,
          );
          deps.exit(ExitCode.UserError);
        }
      }
      let estimateParsed: number | undefined;
      if (o.estimate !== undefined && o.estimate !== "") {
        const n = Number(o.estimate);
        if (!Number.isFinite(n) || n < 0) {
          deps.error(
            `Invalid --estimate ${JSON.stringify(o.estimate)} (expected a non-negative finite number)`,
          );
          deps.exit(ExitCode.UserError);
        }
        estimateParsed = n;
      }
      const startAtStr = parseCliOptionalIsoInstantString(
        o.startAt,
        "--start-at",
        deps,
      );
      const targetFinishAtStr = parseCliOptionalIsoInstantString(
        o.targetFinishAt,
        "--target-finish-at",
        deps,
      );
      const planningPayload: Record<string, unknown> = {
        ...labelsPayloadCreate,
        ...(priorityParsed !== undefined ? { priority: priorityParsed } : {}),
        ...(sizeParsed !== undefined ? { size: sizeParsed } : {}),
        ...(estimateParsed !== undefined ? { estimate: estimateParsed } : {}),
        ...(startAtStr !== undefined ? { startWorkAt: startAtStr } : {}),
        ...(targetFinishAtStr !== undefined
          ? { targetFinishAt: targetFinishAtStr }
          : {}),
      };
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        const storyRaw = o.story;
        const storyTrimmed =
          storyRaw !== undefined && storyRaw !== ""
            ? storyRaw.trim()
            : undefined;
        if (storyTrimmed !== undefined) {
          const storyRow = proj.stories.get(storyTrimmed);
          if (!storyRow || storyRow.deleted) {
            throw new Error(`Story not found: ${storyTrimmed}`);
          }
        }
        const id = o.id ?? ulid();
        const status = parseCliWorkItemStatus(o.status, deps);
        const assigneeCreate =
          o.assignee !== undefined
            ? { assignee: normalizeGithubLogin(o.assignee) }
            : {};
        const storyPayload =
          storyTrimmed !== undefined ? { storyId: storyTrimmed } : {};
        const branchTokens = normalizeCliStringList(o.branch);
        const branchesNorm = normalizeTicketBranchListFromStrings(branchTokens);
        const branchesPayload =
          branchesNorm.length > 0 ? { branches: branchesNorm } : {};
        const evt = makeEvent(
          "TicketCreated",
          {
            id,
            ...storyPayload,
            title: o.title,
            body,
            ...(status !== undefined ? { status } : {}),
            ...assigneeCreate,
            ...branchesPayload,
            ...planningPayload,
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
    .option(
      "--branch <name>",
      "when listing (no --id): only tickets linked to this branch (normalized exact match)",
    )
    .option(
      "--priority <p>",
      "when listing (no --id): OR-set of priorities (repeat flag); low|medium|high|urgent",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--size <s>",
      "when listing (no --id): OR-set of sizes (repeat flag); xs|s|m|l|xl",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--label <name>",
      "when listing (no --id): ticket must include this label (repeat = AND all listed)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--estimate-min <n>",
      "when listing (no --id): inclusive lower bound on estimate",
    )
    .option(
      "--estimate-max <n>",
      "when listing (no --id): inclusive upper bound on estimate",
    )
    .option(
      "--start-after <iso>",
      "when listing (no --id): inclusive lower bound on startWorkAt (ISO-8601)",
    )
    .option(
      "--start-before <iso>",
      "when listing (no --id): inclusive upper bound on startWorkAt (ISO-8601)",
    )
    .option(
      "--target-finish-after <iso>",
      "when listing (no --id): inclusive lower bound on targetFinishAt (ISO-8601)",
    )
    .option(
      "--target-finish-before <iso>",
      "when listing (no --id): inclusive upper bound on targetFinishAt (ISO-8601)",
    )
    .option(
      "--without-story",
      "when listing (no --id): only tickets without a story (cannot combine with --story or --epic)",
      false,
    )
    .option(
      "--sort-by <field>",
      `when listing (no --id): sort field (${TICKET_LIST_SORT_FIELDS.join("|")}); default id`,
    )
    .option("--sort-dir <d>", "when listing (no --id): asc|desc (default asc)")
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
        branch?: string;
        withoutStory?: boolean;
        priority?: string | string[];
        size?: string | string[];
        label?: string | string[];
        estimateMin?: string;
        estimateMax?: string;
        startAfter?: string;
        startBefore?: string;
        targetFinishAfter?: string;
        targetFinishBefore?: string;
        sortBy?: string;
        sortDir?: string;
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
      "--story <id>",
      "attach ticket to this story (must exist and not be deleted)",
    )
    .option("--unlink-story", "remove the ticket from its story", false)
    .option(
      "--assignee <login>",
      "set assignee to this GitHub login (normalized)",
    )
    .option("--unassign", "remove the ticket assignee", false)
    .option(
      "--add-branch <name>",
      "link another git branch (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--remove-branch <name>",
      "unlink a git branch by name (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--clear-branches",
      "remove all linked git branches from the ticket",
      false,
    )
    .option(
      "--add-label <name>",
      "add a planning label (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--remove-label <name>",
      "remove a planning label by exact text (repeatable)",
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option(
      "--clear-labels",
      "remove all planning labels from the ticket",
      false,
    )
    .option("--priority <p>", "low|medium|high|urgent")
    .option("--clear-priority", "remove priority", false)
    .option("--size <s>", "xs|s|m|l|xl")
    .option("--clear-size", "remove size", false)
    .option("--estimate <n>", "non-negative estimate (e.g. story points)")
    .option("--clear-estimate", "remove estimate", false)
    .option("--start-at <iso>", "planned start work at (ISO-8601)")
    .option("--clear-start-at", "remove start work date", false)
    .option("--target-finish-at <iso>", "planned target finish at (ISO-8601)")
    .option("--clear-target-finish-at", "remove target finish date", false)
    .option("--ai-improve", "expand description via AI (explicit)", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        id: string;
        title?: string;
        body?: string;
        status?: string;
        story?: string;
        unlinkStory?: boolean;
        assignee?: string;
        unassign?: boolean;
        addBranch?: string | string[];
        removeBranch?: string | string[];
        clearBranches?: boolean;
        addLabel?: string | string[];
        removeLabel?: string | string[];
        clearLabels?: boolean;
        priority?: string;
        clearPriority?: boolean;
        size?: string;
        clearSize?: boolean;
        estimate?: string;
        clearEstimate?: boolean;
        startAt?: string;
        clearStartAt?: boolean;
        targetFinishAt?: string;
        clearTargetFinishAt?: boolean;
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
      if (o.story !== undefined && o.unlinkStory) {
        deps.error("Cannot use --story and --unlink-story together");
        deps.exit(ExitCode.UserError);
      }
      if (o.assignee !== undefined && normalizeGithubLogin(o.assignee) === "") {
        deps.error("--assignee must be a non-empty login");
        deps.exit(ExitCode.UserError);
      }
      const storyTrimmed =
        o.story !== undefined && o.story !== "" ? o.story.trim() : undefined;
      if (o.story !== undefined && storyTrimmed === "") {
        deps.error("--story must be a non-empty id");
        deps.exit(ExitCode.UserError);
      }
      const addBranchTokens = normalizeCliStringList(o.addBranch);
      const removeBranchTokens = normalizeCliStringList(o.removeBranch);
      if (
        o.clearBranches === true &&
        (addBranchTokens.length > 0 || removeBranchTokens.length > 0)
      ) {
        deps.error(
          "Cannot use --clear-branches with --add-branch or --remove-branch",
        );
        deps.exit(ExitCode.UserError);
      }
      const addLabelTokens = normalizeCliStringList(o.addLabel);
      const removeLabelTokens = normalizeCliStringList(o.removeLabel);
      if (
        o.clearLabels === true &&
        (addLabelTokens.length > 0 || removeLabelTokens.length > 0)
      ) {
        deps.error(
          "Cannot use --clear-labels with --add-label or --remove-label",
        );
        deps.exit(ExitCode.UserError);
      }
      const mutual = (
        clear: boolean | undefined,
        set: string | undefined,
        clearName: string,
        setName: string,
      ): void => {
        if (clear === true && set !== undefined && set !== "") {
          deps.error(`Cannot use ${clearName} and ${setName} together`);
          deps.exit(ExitCode.UserError);
        }
      };
      mutual(o.clearPriority, o.priority, "--clear-priority", "--priority");
      mutual(o.clearSize, o.size, "--clear-size", "--size");
      mutual(o.clearEstimate, o.estimate, "--clear-estimate", "--estimate");
      mutual(o.clearStartAt, o.startAt, "--clear-start-at", "--start-at");
      mutual(
        o.clearTargetFinishAt,
        o.targetFinishAt,
        "--clear-target-finish-at",
        "--target-finish-at",
      );
      let priorityUpdate: TicketPriority | null | undefined;
      if (o.clearPriority === true) {
        priorityUpdate = null;
      } else if (o.priority !== undefined && o.priority !== "") {
        const p = tryParseTicketPriority(o.priority);
        if (p === undefined) {
          deps.error(
            `Invalid --priority ${JSON.stringify(o.priority)} (expected low|medium|high|urgent)`,
          );
          deps.exit(ExitCode.UserError);
        }
        priorityUpdate = p;
      }
      let sizeUpdate: TicketSize | null | undefined;
      if (o.clearSize === true) {
        sizeUpdate = null;
      } else if (o.size !== undefined && o.size !== "") {
        const s = tryParseTicketSize(o.size);
        if (s === undefined) {
          deps.error(
            `Invalid --size ${JSON.stringify(o.size)} (expected xs|s|m|l|xl)`,
          );
          deps.exit(ExitCode.UserError);
        }
        sizeUpdate = s;
      }
      let estimateUpdate: number | null | undefined;
      if (o.clearEstimate === true) {
        estimateUpdate = null;
      } else if (o.estimate !== undefined && o.estimate !== "") {
        const n = Number(o.estimate);
        if (!Number.isFinite(n) || n < 0) {
          deps.error(
            `Invalid --estimate ${JSON.stringify(o.estimate)} (expected a non-negative finite number)`,
          );
          deps.exit(ExitCode.UserError);
        }
        estimateUpdate = n;
      }
      const startAtUpdate: string | null | undefined =
        o.clearStartAt === true
          ? null
          : parseCliOptionalIsoInstantString(o.startAt, "--start-at", deps);
      const targetFinishUpdate: string | null | undefined =
        o.clearTargetFinishAt === true
          ? null
          : parseCliOptionalIsoInstantString(
              o.targetFinishAt,
              "--target-finish-at",
              deps,
            );
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        if (storyTrimmed !== undefined) {
          const storyRow = proj.stories.get(storyTrimmed);
          if (!storyRow || storyRow.deleted) {
            throw new Error(`Story not found: ${storyTrimmed}`);
          }
        }
        const status = parseCliWorkItemStatus(o.status, deps);
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (body !== undefined) payload["body"] = body;
        if (status !== undefined) payload["status"] = status;
        if (o.unlinkStory) {
          payload["storyId"] = null;
        } else if (storyTrimmed !== undefined) {
          payload["storyId"] = storyTrimmed;
        }
        if (o.unassign) {
          payload["assignee"] = null;
        } else if (o.assignee !== undefined) {
          payload["assignee"] = normalizeGithubLogin(o.assignee);
        }
        const wantsBranchChange =
          o.clearBranches === true ||
          addBranchTokens.length > 0 ||
          removeBranchTokens.length > 0;
        if (wantsBranchChange) {
          const curRow = proj.tickets.get(o.id);
          if (curRow === undefined || curRow.deleted) {
            throw new Error(`Ticket not found: ${o.id}`);
          }
          let next: string[];
          if (o.clearBranches === true) {
            next = [];
          } else {
            const removeSet = new Set(
              removeBranchTokens
                .map((x) => normalizeTicketBranchName(x))
                .filter((x): x is string => x !== undefined),
            );
            next = curRow.linkedBranches.filter((b) => !removeSet.has(b));
            for (const raw of addBranchTokens) {
              const nb = normalizeTicketBranchName(raw);
              if (nb !== undefined && !next.includes(nb)) {
                next.push(nb);
              }
            }
            next = normalizeTicketBranchListFromStrings(next);
          }
          if (!ticketBranchListsEqual(next, curRow.linkedBranches)) {
            payload["branches"] = next;
          }
        }
        const wantsLabelChange =
          o.clearLabels === true ||
          addLabelTokens.length > 0 ||
          removeLabelTokens.length > 0;
        if (wantsLabelChange) {
          const curRow = proj.tickets.get(o.id);
          if (curRow === undefined || curRow.deleted) {
            throw new Error(`Ticket not found: ${o.id}`);
          }
          let nextLabels: string[];
          if (o.clearLabels === true) {
            nextLabels = [];
          } else {
            const removeSet = new Set(
              normalizeTicketLabelList(removeLabelTokens),
            );
            nextLabels = normalizeTicketLabelList(
              (curRow.labels ?? []).filter((lb) => !removeSet.has(lb)),
            );
            nextLabels = normalizeTicketLabelList([
              ...nextLabels,
              ...addLabelTokens,
            ]);
          }
          if (!ticketLabelListsEqual(curRow.labels, nextLabels)) {
            payload["labels"] = nextLabels;
          }
        }
        if (priorityUpdate !== undefined) {
          payload["priority"] = priorityUpdate;
        }
        if (sizeUpdate !== undefined) {
          payload["size"] = sizeUpdate;
        }
        if (estimateUpdate !== undefined) {
          payload["estimate"] = estimateUpdate;
        }
        if (startAtUpdate !== undefined) {
          payload["startWorkAt"] = startAtUpdate;
        }
        if (targetFinishUpdate !== undefined) {
          payload["targetFinishAt"] = targetFinishUpdate;
        }
        const evt = makeEvent("TicketUpdated", payload, deps.clock, actor);
        await appendEventLine(root, evt, deps.clock);
        return payload;
      });
    });
  ticket
    .command("comment")
    .description("Append a durable comment on a ticket")
    .requiredOption("--id <id>", "ticket id")
    .requiredOption("--body <text>", "comment body")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string; body: string }>();
      const trimmed = o.body.trim();
      if (trimmed === "") {
        deps.error("--body must be non-empty (after trim)");
        deps.exit(ExitCode.UserError);
      }
      await mutateDataBranch(g, deps, async (root, { actor }) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        const row = proj.tickets.get(o.id);
        if (!row || row.deleted) {
          throw new Error(`Ticket not found: ${o.id}`);
        }
        const evt = makeEvent(
          "TicketCommentAdded",
          { ticketId: o.id, body: trimmed },
          deps.clock,
          actor,
        );
        await appendEventLine(root, evt, deps.clock);
        return { commentId: evt.id, ticketId: o.id, body: trimmed };
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
    .option(
      "--text-style <s>",
      "when --format text: tsv (default) | plain | plain-links",
      "tsv",
    )
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        limit?: number;
        type?: string;
        entityId?: string;
        textStyle?: string;
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
            const textStyle = parseAuditTextStyle(o.textStyle);
            if (textStyle === undefined) {
              deps.error(
                `Invalid --text-style: ${String(o.textStyle)} (use tsv, plain, or plain-links)`,
              );
              deps.exit(ExitCode.UserError);
            }
            if (textStyle === "tsv") {
              deps.log(formatAuditTextLines(events));
            } else {
              let githubRepo: { owner: string; repo: string } | undefined;
              if (textStyle === "plain-links") {
                try {
                  githubRepo = resolveGithubRepo(cfg, env.GITHUB_REPO);
                } catch {
                  githubRepo = undefined;
                }
              }
              deps.log(
                formatAuditPlainLines(events, {
                  style: textStyle,
                  githubRepo,
                }),
              );
            }
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
 * `--without-story` lists only tickets with no story and cannot be combined with `--story` or `--epic`.
 *
 * @param g - Global CLI flags (repo, format, worktree, etc.).
 * @param opts - Parsed `ticket read` options (`id`, `story`, `withoutStory`, list-only filters, sort flags).
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
    branch?: string;
    withoutStory?: boolean;
    priority?: string | string[];
    size?: string | string[];
    label?: string | string[];
    estimateMin?: string;
    estimateMax?: string;
    startAfter?: string;
    startBefore?: string;
    targetFinishAfter?: string;
    targetFinishBefore?: string;
    sortBy?: string;
    sortDir?: string;
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
      const {
        id,
        story: storyIdRaw,
        epic: epicIdRaw,
        sortBy: sortByOpt,
        sortDir: sortDirOpt,
        withoutStory: withoutStoryRaw,
        ...listFlagRest
      } = opts;
      if (id === undefined || id === "") {
        const listWithoutStory = withoutStoryRaw === true;
        const storyFilter =
          storyIdRaw !== undefined && storyIdRaw !== ""
            ? storyIdRaw
            : undefined;
        const epicFilter =
          epicIdRaw !== undefined && epicIdRaw !== "" ? epicIdRaw : undefined;
        const sortBy = tryParseTicketListSortField(sortByOpt);
        const sortDir = tryParseTicketListSortDir(sortDirOpt);
        if (sortBy === undefined) {
          deps.error(
            `Invalid --sort-by ${JSON.stringify(
              sortByOpt ?? "",
            )} (expected one of: ${TICKET_LIST_SORT_FIELDS.join(", ")})`,
          );
          exitCode = ExitCode.UserError;
        } else if (sortDir === undefined) {
          deps.error(
            `Invalid --sort-dir ${JSON.stringify(
              sortDirOpt ?? "",
            )} (expected asc|desc)`,
          );
          exitCode = ExitCode.UserError;
        } else if (storyFilter !== undefined && epicFilter !== undefined) {
          deps.error(
            "Cannot use --story and --epic together when listing tickets",
          );
          exitCode = ExitCode.UserError;
        } else if (listWithoutStory && storyFilter !== undefined) {
          deps.error(
            "Cannot use --without-story and --story together when listing tickets",
          );
          exitCode = ExitCode.UserError;
        } else if (listWithoutStory && epicFilter !== undefined) {
          deps.error(
            "Cannot use --without-story and --epic together when listing tickets",
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
                  sortBy,
                  sortDir,
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
                  sortBy,
                  sortDir,
                }),
              }),
            );
          }
        } else if (listWithoutStory) {
          const listQuery = buildTicketListQueryFromReadListOpts(
            { withoutStory: true, ...listFlagRest },
            deps,
          );
          deps.log(
            formatOutput(g.format, {
              items: listActiveTicketSummaries(proj, {
                query: listQuery,
                sortBy,
                sortDir,
              }),
            }),
          );
        } else {
          const listQuery = buildTicketListQueryFromReadListOpts(
            { epic: epicFilter, ...listFlagRest },
            deps,
          );
          deps.log(
            formatOutput(g.format, {
              items: listActiveTicketSummaries(proj, {
                query: listQuery,
                sortBy,
                sortDir,
              }),
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
