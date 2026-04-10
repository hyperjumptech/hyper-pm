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
import { ExitCode } from "./cli/exit-codes";
import { formatOutput } from "./cli/format-output";
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
import { commitDataWorktreeIfNeeded } from "./run/commit-data";
import { appendEventLine } from "./storage/append-event";
import type { EventLine, EventType } from "./storage/event-line";
import { readAllEventLines } from "./storage/read-event-lines";
import { replayEvents } from "./storage/projection";
import {
  loadProjectionFromDataRoot,
  resolveGithubRepo,
  runGithubInboundSync,
  runGithubOutboundSync,
} from "./sync/run-github-sync";

type GlobalOpts = {
  format: "json" | "text";
  tempDir?: string;
  keepWorktree: boolean;
  repo?: string;
  dataBranch?: string;
  remote?: string;
  sync?: string;
  githubRepo?: string;
};

const readGlobals = (cmd: Command): GlobalOpts => {
  let root: Command = cmd;
  while (root.parent) {
    root = root.parent;
  }
  return root.opts() as GlobalOpts;
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
    .option("--github-repo <owner/repo>", "override GitHub slug");

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
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ title: string; body: string; id?: string }>();
      await mutateDataBranch(g, deps, async (root) => {
        const id = o.id ?? ulid();
        const evt = makeEvent(
          "EpicCreated",
          { id, title: o.title, body: o.body },
          deps.clock,
        );
        await appendEventLine(root, evt, deps.clock);
        return evt.payload;
      });
    });
  epic
    .command("read")
    .requiredOption("--id <id>", "id")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string }>();
      await readEpic(g, o.id, deps);
    });
  epic
    .command("update")
    .requiredOption("--id <id>", "id")
    .option("--title <t>")
    .option("--body <b>")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string; title?: string; body?: string }>();
      await mutateDataBranch(g, deps, async (root) => {
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (o.body !== undefined) payload["body"] = o.body;
        const evt = makeEvent("EpicUpdated", payload, deps.clock);
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
      await mutateDataBranch(g, deps, async (root) => {
        const evt = makeEvent("EpicDeleted", { id: o.id }, deps.clock);
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
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        title: string;
        body: string;
        epic: string;
        id?: string;
      }>();
      await mutateDataBranch(g, deps, async (root) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        const epic = proj.epics.get(o.epic);
        if (!epic || epic.deleted) {
          throw new Error(`Epic not found: ${o.epic}`);
        }
        const id = o.id ?? ulid();
        const evt = makeEvent(
          "StoryCreated",
          { id, epicId: o.epic, title: o.title, body: o.body },
          deps.clock,
        );
        await appendEventLine(root, evt, deps.clock);
        return evt.payload;
      });
    });
  story
    .command("read")
    .requiredOption("--id <id>")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string }>();
      await readStory(g, o.id, deps);
    });
  story
    .command("update")
    .requiredOption("--id <id>")
    .option("--title <t>")
    .option("--body <b>")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string; title?: string; body?: string }>();
      await mutateDataBranch(g, deps, async (root) => {
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (o.body !== undefined) payload["body"] = o.body;
        const evt = makeEvent("StoryUpdated", payload, deps.clock);
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
      await mutateDataBranch(g, deps, async (root) => {
        const evt = makeEvent("StoryDeleted", { id: o.id }, deps.clock);
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
    .option("--ai-draft", "draft body via AI (explicit)", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        title: string;
        body: string;
        story: string;
        id?: string;
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
      await mutateDataBranch(g, deps, async (root) => {
        const lines = await readAllEventLines(root);
        const proj = replayEvents(lines);
        const storyRow = proj.stories.get(o.story);
        if (!storyRow || storyRow.deleted) {
          throw new Error(`Story not found: ${o.story}`);
        }
        const id = o.id ?? ulid();
        const evt = makeEvent(
          "TicketCreated",
          {
            id,
            storyId: o.story,
            title: o.title,
            body,
            state: "open",
          },
          deps.clock,
        );
        await appendEventLine(root, evt, deps.clock);
        return evt.payload;
      });
    });
  ticket
    .command("read")
    .requiredOption("--id <id>")
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{ id: string }>();
      await readTicket(g, o.id, deps);
    });
  ticket
    .command("update")
    .requiredOption("--id <id>")
    .option("--title <t>")
    .option("--body <b>")
    .option("--state <s>")
    .option("--ai-improve", "expand description via AI (explicit)", false)
    .action(async function (this: Command) {
      const g = readGlobals(this);
      const o = this.opts<{
        id: string;
        title?: string;
        body?: string;
        state?: string;
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
      await mutateDataBranch(g, deps, async (root) => {
        const payload: Record<string, unknown> = { id: o.id };
        if (o.title !== undefined) payload["title"] = o.title;
        if (body !== undefined) payload["body"] = body;
        if (o.state !== undefined) payload["state"] = o.state;
        const evt = makeEvent("TicketUpdated", payload, deps.clock);
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
      await mutateDataBranch(g, deps, async (root) => {
        const evt = makeEvent("TicketDeleted", { id: o.id }, deps.clock);
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
      if (!env.GITHUB_TOKEN) {
        deps.error("GITHUB_TOKEN required for sync");
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
        const octokit = new Octokit({ auth: env.GITHUB_TOKEN });
        const depsGh = {
          octokit,
          owner,
          repo,
          clock: deps.clock,
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
        await commitDataWorktreeIfNeeded(
          session.worktreePath,
          "hyper-pm: sync",
          runGit,
        );
        deps.log(formatOutput(g.format, { ok: true }));
        deps.exit(ExitCode.Success);
      } catch (e) {
        deps.error(e instanceof Error ? e.message : String(e));
        deps.exit(ExitCode.ExternalApi);
      } finally {
        await session.dispose();
      }
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

const makeEvent = (
  type: EventType,
  payload: Record<string, unknown>,
  clock: { now: () => Date },
): EventLine => ({
  schema: 1,
  type,
  id: ulid(),
  ts: clock.now().toISOString(),
  actor: "cli",
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
  },
  fn: (dataRoot: string) => Promise<Record<string, unknown>>,
): Promise<void> => {
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
      const payload = await fn(session.worktreePath);
      await commitDataWorktreeIfNeeded(
        session.worktreePath,
        "hyper-pm: mutation",
        runGit,
      );
      deps.log(formatOutput(g.format, { ok: true, ...payload }));
      deps.exit(ExitCode.Success);
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
};

const readEpic = async (
  g: GlobalOpts,
  id: string,
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
  },
): Promise<void> => {
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
      const row = proj.epics.get(id);
      if (!row || row.deleted) {
        deps.error("Epic not found");
        deps.exit(ExitCode.UserError);
      }
      deps.log(formatOutput(g.format, row));
      deps.exit(ExitCode.Success);
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
};

const readStory = async (
  g: GlobalOpts,
  id: string,
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
  },
): Promise<void> => {
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
      const row = proj.stories.get(id);
      if (!row || row.deleted) {
        deps.error("Story not found");
        deps.exit(ExitCode.UserError);
      }
      deps.log(formatOutput(g.format, row));
      deps.exit(ExitCode.Success);
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
};

const readTicket = async (
  g: GlobalOpts,
  id: string,
  deps: {
    exit: (code: number) => never;
    log: typeof console.log;
    error: typeof console.error;
  },
): Promise<void> => {
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
      const row = proj.tickets.get(id);
      if (!row || row.deleted) {
        deps.error("Ticket not found");
        deps.exit(ExitCode.UserError);
      }
      deps.log(formatOutput(g.format, row));
      deps.exit(ExitCode.Success);
    } finally {
      await session.dispose();
    }
  } catch (e) {
    deps.error(e instanceof Error ? e.message : String(e));
    deps.exit(ExitCode.UserError);
  }
};
