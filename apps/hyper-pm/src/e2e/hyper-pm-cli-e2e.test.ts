/** @vitest-environment node */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@workspace/env";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../cli-entry";
import { ExitCode } from "../cli/exit-codes";
import {
  createGitRepoWithInitialCommit,
  git,
} from "./hyper-pm-e2e-git-fixtures";

/** Thrown by {@link invokeHyperPmCli} when the CLI calls injected `deps.exit`. */
class CliExitSignal extends Error {
  /**
   * @param code - Exit code passed to `exit`.
   */
  constructor(readonly code: number) {
    super("cli-exit");
    this.name = "CliExitSignal";
  }
}

type InvokeHyperPmCliCtx = {
  /** Git repository root passed as `--repo`. */
  repoRoot: string;
  /** Parent directory for disposable git worktrees (`--temp-dir`). */
  tempDir: string;
  /** Optional fixed clock for deterministic event timestamps. */
  clock?: { now: () => Date };
  /** Optional `--actor` audit label. */
  actor?: string;
};

type InvokeHyperPmCliResult = {
  code: number;
  stdout: string;
  stderr: string;
  json: unknown;
};

/**
 * Invokes {@link runCli} with injected `exit`/`log`/`error`, wiring global `--repo` and `--temp-dir`.
 *
 * @param argv - Tokens after the synthetic `node` / `hyper-pm` argv positions (subcommands and flags).
 * @param ctx - Repository root, temp base, and optional clock or actor.
 * @returns Captured streams, parsed JSON when stdout is valid JSON, and exit code.
 */
const invokeHyperPmCli = async (
  argv: string[],
  ctx: InvokeHyperPmCliCtx,
): Promise<InvokeHyperPmCliResult> => {
  const logs: string[] = [];
  const errors: string[] = [];
  let code: number = ExitCode.Success;
  const prefix = [
    "node",
    "hyper-pm",
    "--repo",
    ctx.repoRoot,
    "--temp-dir",
    ctx.tempDir,
  ];
  if (ctx.actor !== undefined) {
    prefix.push("--actor", ctx.actor);
  }
  const fullArgv = [...prefix, ...argv];
  try {
    await runCli(fullArgv, {
      exit: (c: number) => {
        code = c;
        throw new CliExitSignal(c);
      },
      log: (line: string) => {
        logs.push(line);
      },
      error: (line: string) => {
        errors.push(line);
      },
      clock: ctx.clock ?? { now: () => new Date() },
    });
  } catch (e) {
    if (!(e instanceof CliExitSignal)) {
      throw e;
    }
  }
  const stdout = logs.join("\n");
  const stderr = errors.join("\n");
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr, json };
};

describe("hyper-pm CLI (e2e)", () => {
  const bases: string[] = [];

  afterEach(async () => {
    for (const b of bases.splice(0, bases.length)) {
      await rm(b, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("covers init, epic/story/ticket CRUD, audit, doctor, sync skip, and ai-draft auth gate", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hyper-pm-e2e-"));
    bases.push(base);
    const repoRoot = await createGitRepoWithInitialCommit(base);
    const tempDir = join(base, "wt");
    const clock = { now: () => new Date("2026-04-11T15:30:00.000Z") };

    // Act — init
    const initOut = await invokeHyperPmCli(["--sync", "off", "init"], {
      repoRoot,
      tempDir,
      clock,
      actor: "e2e",
    });

    // Assert — init
    expect(initOut.code).toBe(ExitCode.Success);
    expect(initOut.json).toEqual(
      expect.objectContaining({ ok: true, dataBranch: "hyper-pm-data" }),
    );

    // Setup — commit config to main so clones share `.hyper-pm`
    await git(repoRoot, ["add", ".hyper-pm"]);
    await git(repoRoot, ["commit", "-m", "hyper-pm config"]);

    // Act — epic create / read list / read one / update / (story chain continues)
    const epicCreate = await invokeHyperPmCli(
      [
        "epic",
        "create",
        "--id",
        "epic-e2e-1",
        "--title",
        "E2E Epic",
        "--body",
        "epic body",
        "--status",
        "backlog",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(epicCreate.code).toBe(ExitCode.Success);
    expect(epicCreate.json).toEqual(
      expect.objectContaining({
        ok: true,
        id: "epic-e2e-1",
        title: "E2E Epic",
      }),
    );

    const epicList = await invokeHyperPmCli(["epic", "read"], {
      repoRoot,
      tempDir,
      clock,
    });
    expect(epicList.code).toBe(ExitCode.Success);
    expect(epicList.json).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: "epic-e2e-1", title: "E2E Epic" }),
        ]),
      }),
    );

    const epicOne = await invokeHyperPmCli(
      ["epic", "read", "--id", "epic-e2e-1"],
      {
        repoRoot,
        tempDir,
        clock,
      },
    );
    expect(epicOne.code).toBe(ExitCode.Success);
    expect(epicOne.json).toEqual(
      expect.objectContaining({ id: "epic-e2e-1", title: "E2E Epic" }),
    );

    const epicUpdate = await invokeHyperPmCli(
      [
        "epic",
        "update",
        "--id",
        "epic-e2e-1",
        "--title",
        "E2E Epic Updated",
        "--status",
        "in_progress",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(epicUpdate.code).toBe(ExitCode.Success);

    const storyCreate = await invokeHyperPmCli(
      [
        "story",
        "create",
        "--id",
        "story-e2e-1",
        "--epic",
        "epic-e2e-1",
        "--title",
        "Story A",
        "--body",
        "story body",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(storyCreate.code).toBe(ExitCode.Success);
    expect(storyCreate.json).toEqual(
      expect.objectContaining({
        ok: true,
        id: "story-e2e-1",
        epicId: "epic-e2e-1",
      }),
    );

    const storyList = await invokeHyperPmCli(["story", "read"], {
      repoRoot,
      tempDir,
      clock,
    });
    expect(storyList.code).toBe(ExitCode.Success);
    expect(storyList.json).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: "story-e2e-1" }),
        ]),
      }),
    );

    const storyListByEpic = await invokeHyperPmCli(
      ["story", "read", "--epic", "epic-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(storyListByEpic.code).toBe(ExitCode.Success);
    expect(storyListByEpic.json).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "story-e2e-1",
            epicId: "epic-e2e-1",
          }),
        ],
      }),
    );

    const ticketCreate = await invokeHyperPmCli(
      [
        "ticket",
        "create",
        "--id",
        "ticket-e2e-1",
        "--story",
        "story-e2e-1",
        "--title",
        "Ticket A",
        "--body",
        "acceptance",
        "--status",
        "todo",
        "--label",
        "e2e-label",
        "--priority",
        "medium",
        "--size",
        "s",
        "--estimate",
        "2",
        "--start-at",
        "2026-06-01T00:00:00.000Z",
        "--target-finish-at",
        "2026-06-15T00:00:00.000Z",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketCreate.code).toBe(ExitCode.Success);

    const ticketRead = await invokeHyperPmCli(
      ["ticket", "read", "--id", "ticket-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketRead.code).toBe(ExitCode.Success);
    expect(ticketRead.json).toEqual(
      expect.objectContaining({
        id: "ticket-e2e-1",
        title: "Ticket A",
        labels: ["e2e-label"],
        priority: "medium",
        size: "s",
        estimate: 2,
        startWorkAt: "2026-06-01T00:00:00.000Z",
        targetFinishAt: "2026-06-15T00:00:00.000Z",
      }),
    );

    const ticketListPlanningFilter = await invokeHyperPmCli(
      [
        "ticket",
        "read",
        "--story",
        "story-e2e-1",
        "--priority",
        "medium",
        "--label",
        "e2e-label",
        "--estimate-min",
        "1",
      ],
      { repoRoot, tempDir, clock },
    );
    expect(ticketListPlanningFilter.code).toBe(ExitCode.Success);
    expect(ticketListPlanningFilter.json).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "ticket-e2e-1",
            labels: ["e2e-label"],
            priority: "medium",
          }),
        ],
      }),
    );

    const ticketPlanningPatch = await invokeHyperPmCli(
      [
        "ticket",
        "update",
        "--id",
        "ticket-e2e-1",
        "--add-label",
        "extra",
        "--estimate",
        "5",
        "--clear-start-at",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketPlanningPatch.code).toBe(ExitCode.Success);
    const ticketReadAfterPlanningPatch = await invokeHyperPmCli(
      ["ticket", "read", "--id", "ticket-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketReadAfterPlanningPatch.json).toEqual(
      expect.objectContaining({
        id: "ticket-e2e-1",
        labels: ["e2e-label", "extra"],
        estimate: 5,
      }),
    );
    expect(ticketReadAfterPlanningPatch.json).not.toHaveProperty("startWorkAt");

    const ticketComment = await invokeHyperPmCli(
      [
        "ticket",
        "comment",
        "--id",
        "ticket-e2e-1",
        "--body",
        "  thread note  ",
      ],
      { repoRoot, tempDir, clock, actor: "commenter" },
    );
    expect(ticketComment.code).toBe(ExitCode.Success);
    expect(ticketComment.json).toEqual(
      expect.objectContaining({
        ticketId: "ticket-e2e-1",
        body: "thread note",
      }),
    );
    expect(ticketComment.json).toMatchObject({
      commentId: expect.any(String),
    });

    const ticketReadAfterComment = await invokeHyperPmCli(
      ["ticket", "read", "--id", "ticket-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketReadAfterComment.code).toBe(ExitCode.Success);
    expect(ticketReadAfterComment.json).toEqual(
      expect.objectContaining({
        id: "ticket-e2e-1",
        comments: [
          expect.objectContaining({
            body: "thread note",
            createdBy: "commenter",
          }),
        ],
      }),
    );

    const ticketListByStory = await invokeHyperPmCli(
      ["ticket", "read", "--story", "story-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketListByStory.code).toBe(ExitCode.Success);
    expect(ticketListByStory.json).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "ticket-e2e-1",
            storyId: "story-e2e-1",
          }),
        ],
      }),
    );

    const ticketWork = await invokeHyperPmCli(
      ["ticket", "work", "--id", "ticket-e2e-1"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketWork.code).toBe(ExitCode.Success);
    expect(ticketWork.json).toEqual(
      expect.objectContaining({
        ok: true,
        id: "ticket-e2e-1",
        status: "in_progress",
        branch: "hyper-pm/ticket-e2e-1",
        branches: ["hyper-pm/ticket-e2e-1"],
      }),
    );
    expect(await git(repoRoot, ["branch", "--show-current"])).toBe(
      "hyper-pm/ticket-e2e-1",
    );
    const ticketReadAfterWork = await invokeHyperPmCli(
      ["ticket", "read", "--id", "ticket-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketReadAfterWork.json).toEqual(
      expect.objectContaining({
        id: "ticket-e2e-1",
        status: "in_progress",
        linkedBranches: ["hyper-pm/ticket-e2e-1"],
      }),
    );

    const ticketCreateCollision = await invokeHyperPmCli(
      [
        "ticket",
        "create",
        "--id",
        "ticket-e2e-2",
        "--story",
        "story-e2e-1",
        "--title",
        "Collision ticket",
        "--body",
        "b",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketCreateCollision.code).toBe(ExitCode.Success);
    await git(repoRoot, ["branch", "hyper-pm/ticket-e2e-2", "HEAD"]);
    const ticketWorkCollision = await invokeHyperPmCli(
      ["ticket", "work", "--id", "ticket-e2e-2"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketWorkCollision.code).toBe(ExitCode.Success);
    expect(ticketWorkCollision.json).toEqual(
      expect.objectContaining({
        ok: true,
        id: "ticket-e2e-2",
        branch: "hyper-pm/ticket-e2e-2-2",
        branchPreferred: "hyper-pm/ticket-e2e-2",
        branches: ["hyper-pm/ticket-e2e-2-2"],
      }),
    );
    expect(await git(repoRoot, ["branch", "--show-current"])).toBe(
      "hyper-pm/ticket-e2e-2-2",
    );

    const ticketCreateOrphan = await invokeHyperPmCli(
      [
        "ticket",
        "create",
        "--id",
        "ticket-e2e-orphan",
        "--title",
        "Orphan ticket",
        "--body",
        "no story yet",
        "--status",
        "backlog",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketCreateOrphan.code).toBe(ExitCode.Success);

    const ticketListNoStory = await invokeHyperPmCli(
      ["ticket", "read", "--without-story"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketListNoStory.code).toBe(ExitCode.Success);
    expect(ticketListNoStory.json).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: "ticket-e2e-orphan",
            storyId: null,
          }),
        ],
      }),
    );

    const noStoryStoryConflict = await invokeHyperPmCli(
      ["ticket", "read", "--without-story", "--story", "story-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(noStoryStoryConflict.code).toBe(ExitCode.UserError);

    const linkOrphan = await invokeHyperPmCli(
      [
        "ticket",
        "update",
        "--id",
        "ticket-e2e-orphan",
        "--story",
        "story-e2e-1",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(linkOrphan.code).toBe(ExitCode.Success);
    const orphanLinkedRead = await invokeHyperPmCli(
      ["ticket", "read", "--id", "ticket-e2e-orphan"],
      { repoRoot, tempDir, clock },
    );
    expect(orphanLinkedRead.json).toEqual(
      expect.objectContaining({
        id: "ticket-e2e-orphan",
        storyId: "story-e2e-1",
      }),
    );

    const unlinkOrphan = await invokeHyperPmCli(
      ["ticket", "update", "--id", "ticket-e2e-orphan", "--unlink-story"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(unlinkOrphan.code).toBe(ExitCode.Success);
    const orphanAgainRead = await invokeHyperPmCli(
      ["ticket", "read", "--id", "ticket-e2e-orphan"],
      { repoRoot, tempDir, clock },
    );
    expect(orphanAgainRead.json).toEqual(
      expect.objectContaining({
        id: "ticket-e2e-orphan",
        storyId: null,
      }),
    );

    const ticketListSortSmoke = await invokeHyperPmCli(
      [
        "ticket",
        "read",
        "--story",
        "story-e2e-1",
        "--sort-by",
        "updatedAt",
        "--sort-dir",
        "desc",
      ],
      { repoRoot, tempDir, clock },
    );
    expect(ticketListSortSmoke.code).toBe(ExitCode.Success);
    expect(ticketListSortSmoke.json).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: "ticket-e2e-1",
            storyId: "story-e2e-1",
          }),
          expect.objectContaining({
            id: "ticket-e2e-2",
            storyId: "story-e2e-1",
          }),
        ]),
      }),
    );

    const ticketListBadSort = await invokeHyperPmCli(
      ["ticket", "read", "--story", "story-e2e-1", "--sort-by", "not-a-field"],
      { repoRoot, tempDir, clock },
    );
    expect(ticketListBadSort.code).toBe(ExitCode.UserError);

    const ticketListByEpicAndStatus = await invokeHyperPmCli(
      [
        "ticket",
        "read",
        "--epic",
        "epic-e2e-1",
        "--status",
        "todo",
        "--status",
        "in_progress",
      ],
      { repoRoot, tempDir, clock },
    );
    expect(ticketListByEpicAndStatus.code).toBe(ExitCode.Success);
    expect(ticketListByEpicAndStatus.json).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: "ticket-e2e-1",
            storyId: "story-e2e-1",
            status: "in_progress",
          }),
          expect.objectContaining({
            id: "ticket-e2e-2",
            storyId: "story-e2e-1",
            status: "in_progress",
          }),
        ]),
      }),
    );

    const storyEpicConflict = await invokeHyperPmCli(
      ["ticket", "read", "--story", "story-e2e-1", "--epic", "epic-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(storyEpicConflict.code).toBe(ExitCode.UserError);

    const ticketUpdate = await invokeHyperPmCli(
      [
        "ticket",
        "update",
        "--id",
        "ticket-e2e-1",
        "--title",
        "Ticket A+",
        "--status",
        "done",
      ],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketUpdate.code).toBe(ExitCode.Success);

    const audit = await invokeHyperPmCli(
      ["audit", "--entity-id", "ticket-e2e-1", "--limit", "5"],
      { repoRoot, tempDir, clock },
    );
    expect(audit.code).toBe(ExitCode.Success);
    expect(audit.json).toEqual(
      expect.objectContaining({
        ok: true,
        events: expect.any(Array),
      }),
    );

    const doctor = await invokeHyperPmCli(["doctor"], {
      repoRoot,
      tempDir,
      clock,
    });
    expect(doctor.code).toBe(ExitCode.Success);
    expect(doctor.json).toEqual({ ok: true });

    const syncSkip = await invokeHyperPmCli(["sync"], {
      repoRoot,
      tempDir,
      clock,
    });
    expect(syncSkip.code).toBe(ExitCode.Success);
    expect(syncSkip.json).toEqual(
      expect.objectContaining({ ok: true, skipped: true }),
    );

    if (!env.HYPER_PM_AI_API_KEY) {
      const aiDraft = await invokeHyperPmCli(
        [
          "ticket",
          "create",
          "--story",
          "story-e2e-1",
          "--title",
          "AI ticket",
          "--ai-draft",
        ],
        { repoRoot, tempDir, clock, actor: "e2e" },
      );
      expect(aiDraft.code).toBe(ExitCode.EnvironmentAuth);
      expect(aiDraft.stderr).toMatch(/HYPER_PM_AI_API_KEY/);
    }

    const ticketDelete2 = await invokeHyperPmCli(
      ["ticket", "delete", "--id", "ticket-e2e-2"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketDelete2.code).toBe(ExitCode.Success);

    const ticketDelete = await invokeHyperPmCli(
      ["ticket", "delete", "--id", "ticket-e2e-1"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(ticketDelete.code).toBe(ExitCode.Success);

    const storyDelete = await invokeHyperPmCli(
      ["story", "delete", "--id", "story-e2e-1"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(storyDelete.code).toBe(ExitCode.Success);

    const epicDelete = await invokeHyperPmCli(
      ["epic", "delete", "--id", "epic-e2e-1"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(epicDelete.code).toBe(ExitCode.Success);

    const epicMissing = await invokeHyperPmCli(
      ["epic", "read", "--id", "epic-e2e-1"],
      { repoRoot, tempDir, clock },
    );
    expect(epicMissing.code).toBe(ExitCode.UserError);

    const badStatus = await invokeHyperPmCli(
      ["epic", "create", "--title", "x", "--status", "nope"],
      { repoRoot, tempDir, clock, actor: "e2e" },
    );
    expect(badStatus.code).toBe(ExitCode.UserError);
  }, 120_000);

  it("merges divergent hyper-pm-data clones without conflicts", async () => {
    // Setup — bare remote + worker1
    const base = await mkdtemp(join(tmpdir(), "hyper-pm-e2e-merge-"));
    bases.push(base);
    const bare = join(base, "central.git");
    const w1 = join(base, "worker1");
    await git(base, ["init", "--bare", "central.git"]);
    await git(base, ["clone", bare, "worker1"]);

    await git(w1, ["config", "user.email", "w1@example.com"]);
    await git(w1, ["config", "user.name", "worker1"]);
    const w1Readme = join(w1, "README.md");
    await writeFile(w1Readme, "# shared\n", "utf8");
    await git(w1, ["add", "README.md"]);
    await git(w1, ["commit", "-m", "init"]);
    await git(w1, ["branch", "-M", "main"]);
    await git(w1, ["push", "-u", "origin", "main"]);

    const temp1 = join(base, "tmp1");
    const clock1 = { now: () => new Date("2026-06-01T10:00:00.000Z") };
    const init1 = await invokeHyperPmCli(["--sync", "off", "init"], {
      repoRoot: w1,
      tempDir: temp1,
      clock: clock1,
      actor: "w1",
    });
    expect(init1.code).toBe(ExitCode.Success);

    await git(w1, ["add", ".hyper-pm"]);
    await git(w1, ["commit", "-m", "config"]);
    await git(w1, ["push", "origin", "main"]);

    const epicW1 = await invokeHyperPmCli(
      ["epic", "create", "--id", "ep-merge-a", "--title", "From W1"],
      { repoRoot: w1, tempDir: temp1, clock: clock1, actor: "w1" },
    );
    expect(epicW1.code).toBe(ExitCode.Success);
    await git(w1, ["push", "-u", "origin", "hyper-pm-data"]);

    // Setup — worker2 clone
    const w2 = join(base, "worker2");
    await git(base, ["clone", bare, "worker2"]);
    await git(w2, ["config", "user.email", "w2@example.com"]);
    await git(w2, ["config", "user.name", "worker2"]);
    await git(w2, ["branch", "hyper-pm-data", "origin/hyper-pm-data"]);

    const temp2 = join(base, "tmp2");
    const clock2 = { now: () => new Date("2026-06-01T11:00:00.000Z") };

    const epicW2 = await invokeHyperPmCli(
      ["epic", "create", "--id", "ep-merge-b", "--title", "From W2"],
      { repoRoot: w2, tempDir: temp2, clock: clock2, actor: "w2" },
    );
    expect(epicW2.code).toBe(ExitCode.Success);
    await git(w2, ["push", "-u", "origin", "hyper-pm-data"]);

    // Act — merge remote data branch into w1
    await git(w1, ["fetch", "origin"]);
    await git(w1, ["checkout", "hyper-pm-data"]);
    await git(w1, ["merge", "origin/hyper-pm-data", "--no-edit"]);

    await git(w1, ["checkout", "main"]);

    const doctorMerged = await invokeHyperPmCli(["doctor"], {
      repoRoot: w1,
      tempDir: temp1,
      clock: clock1,
    });
    expect(doctorMerged.code).toBe(ExitCode.Success);

    const listAfter = await invokeHyperPmCli(["epic", "read"], {
      repoRoot: w1,
      tempDir: temp1,
      clock: clock1,
    });
    expect(listAfter.code).toBe(ExitCode.Success);
    const items = (listAfter.json as { items?: { id: string }[] }).items ?? [];
    const ids = new Set(items.map((i) => i.id));
    expect(ids.has("ep-merge-a")).toBe(true);
    expect(ids.has("ep-merge-b")).toBe(true);
  }, 120_000);
});
