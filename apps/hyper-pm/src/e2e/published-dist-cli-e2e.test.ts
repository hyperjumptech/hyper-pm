/** @vitest-environment node */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "@workspace/env";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ExitCode } from "../cli/exit-codes";
import {
  createGitRepoWithInitialCommit,
  git,
  sleep,
} from "./hyper-pm-e2e-git-fixtures";
import {
  assertDistMainExists,
  getDistMainPath,
  resolveHyperPmPackageRootFromE2eImportMetaUrl,
  spawnBundledHyperPmCliSync,
  toBundledCliInvokeResult,
} from "./published-package-helpers";

type BundledCtx = {
  repoRoot: string;
  tempDir: string;
  actor?: string;
};

describe("dist/main.cjs subprocess (JSON workflow parity)", () => {
  const packageRoot = resolveHyperPmPackageRootFromE2eImportMetaUrl(
    import.meta.url,
  );
  let mainCjsPath: string;

  beforeAll(() => {
    assertDistMainExists(packageRoot);
    mainCjsPath = getDistMainPath(packageRoot);
  });

  /**
   * Runs the published CLI bundle in a subprocess with `--repo` / `--temp-dir` / optional `--actor`.
   *
   * @param argv - CLI tokens after global options.
   * @param ctx - Repository root, temp base, optional actor.
   * @returns Exit code, streams, and parsed JSON when stdout is valid JSON.
   */
  const invokeBundled = (argv: string[], ctx: BundledCtx) =>
    toBundledCliInvokeResult(
      spawnBundledHyperPmCliSync(mainCjsPath, argv, ctx),
    );

  const bases: string[] = [];

  afterEach(async () => {
    for (const b of bases.splice(0, bases.length)) {
      await rm(b, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("covers init, epic/story/ticket CRUD, audit, doctor, sync skip, and ai-draft auth gate", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hyper-pm-dist-e2e-"));
    bases.push(base);
    const repoRoot = await createGitRepoWithInitialCommit(base);
    const tempDir = join(base, "wt");

    // Act — init
    const initOut = invokeBundled(["--sync", "off", "init"], {
      repoRoot,
      tempDir,
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
    const epicCreate = invokeBundled(
      [
        "epic",
        "create",
        "--id",
        "epic-dist-e2e-1",
        "--title",
        "E2E Epic",
        "--body",
        "epic body",
        "--status",
        "backlog",
      ],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(epicCreate.code).toBe(ExitCode.Success);
    expect(epicCreate.json).toEqual(
      expect.objectContaining({
        ok: true,
        id: "epic-dist-e2e-1",
        title: "E2E Epic",
      }),
    );

    const epicList = invokeBundled(["epic", "read"], { repoRoot, tempDir });
    expect(epicList.code).toBe(ExitCode.Success);
    expect(epicList.json).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: "epic-dist-e2e-1",
            title: "E2E Epic",
          }),
        ]),
      }),
    );

    const epicOne = invokeBundled(["epic", "read", "--id", "epic-dist-e2e-1"], {
      repoRoot,
      tempDir,
    });
    expect(epicOne.code).toBe(ExitCode.Success);
    expect(epicOne.json).toEqual(
      expect.objectContaining({ id: "epic-dist-e2e-1", title: "E2E Epic" }),
    );

    const epicUpdate = invokeBundled(
      [
        "epic",
        "update",
        "--id",
        "epic-dist-e2e-1",
        "--title",
        "E2E Epic Updated",
        "--status",
        "in_progress",
      ],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(epicUpdate.code).toBe(ExitCode.Success);

    const storyCreate = invokeBundled(
      [
        "story",
        "create",
        "--id",
        "story-dist-e2e-1",
        "--epic",
        "epic-dist-e2e-1",
        "--title",
        "Story A",
        "--body",
        "story body",
      ],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(storyCreate.code).toBe(ExitCode.Success);
    expect(storyCreate.json).toEqual(
      expect.objectContaining({
        ok: true,
        id: "story-dist-e2e-1",
        epicId: "epic-dist-e2e-1",
      }),
    );

    const storyList = invokeBundled(["story", "read"], { repoRoot, tempDir });
    expect(storyList.code).toBe(ExitCode.Success);
    expect(storyList.json).toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ id: "story-dist-e2e-1" }),
        ]),
      }),
    );

    const ticketCreate = invokeBundled(
      [
        "ticket",
        "create",
        "--id",
        "ticket-dist-e2e-1",
        "--story",
        "story-dist-e2e-1",
        "--title",
        "Ticket A",
        "--body",
        "acceptance",
        "--status",
        "todo",
      ],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(ticketCreate.code).toBe(ExitCode.Success);

    const ticketRead = invokeBundled(
      ["ticket", "read", "--id", "ticket-dist-e2e-1"],
      { repoRoot, tempDir },
    );
    expect(ticketRead.code).toBe(ExitCode.Success);
    expect(ticketRead.json).toEqual(
      expect.objectContaining({ id: "ticket-dist-e2e-1", title: "Ticket A" }),
    );

    const ticketUpdate = invokeBundled(
      [
        "ticket",
        "update",
        "--id",
        "ticket-dist-e2e-1",
        "--title",
        "Ticket A+",
        "--status",
        "done",
      ],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(ticketUpdate.code).toBe(ExitCode.Success);

    const audit = invokeBundled(
      ["audit", "--entity-id", "ticket-dist-e2e-1", "--limit", "5"],
      { repoRoot, tempDir },
    );
    expect(audit.code).toBe(ExitCode.Success);
    expect(audit.json).toEqual(
      expect.objectContaining({
        ok: true,
        events: expect.any(Array),
      }),
    );

    const doctor = invokeBundled(["doctor"], { repoRoot, tempDir });
    expect(doctor.code).toBe(ExitCode.Success);
    expect(doctor.json).toEqual({ ok: true });

    const syncSkip = invokeBundled(["sync"], { repoRoot, tempDir });
    expect(syncSkip.code).toBe(ExitCode.Success);
    expect(syncSkip.json).toEqual(
      expect.objectContaining({ ok: true, skipped: true }),
    );

    if (!env.HYPER_PM_AI_API_KEY) {
      const aiDraft = invokeBundled(
        [
          "ticket",
          "create",
          "--story",
          "story-dist-e2e-1",
          "--title",
          "AI ticket",
          "--ai-draft",
        ],
        { repoRoot, tempDir, actor: "e2e" },
      );
      expect(aiDraft.code).toBe(ExitCode.EnvironmentAuth);
      expect(`${aiDraft.stdout}\n${aiDraft.stderr}`).toMatch(
        /HYPER_PM_AI_API_KEY/,
      );
    }

    const ticketDelete = invokeBundled(
      ["ticket", "delete", "--id", "ticket-dist-e2e-1"],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(ticketDelete.code).toBe(ExitCode.Success);

    const storyDelete = invokeBundled(
      ["story", "delete", "--id", "story-dist-e2e-1"],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(storyDelete.code).toBe(ExitCode.Success);

    const epicDelete = invokeBundled(
      ["epic", "delete", "--id", "epic-dist-e2e-1"],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(epicDelete.code).toBe(ExitCode.Success);

    const epicMissing = invokeBundled(
      ["epic", "read", "--id", "epic-dist-e2e-1"],
      { repoRoot, tempDir },
    );
    expect(epicMissing.code).toBe(ExitCode.UserError);

    const badStatus = invokeBundled(
      ["epic", "create", "--title", "x", "--status", "nope"],
      { repoRoot, tempDir, actor: "e2e" },
    );
    expect(badStatus.code).toBe(ExitCode.UserError);
  }, 120_000);

  it("merges divergent hyper-pm-data clones without conflicts when events use separate shard files", async () => {
    // Setup — bare remote + worker1
    const base = await mkdtemp(join(tmpdir(), "hyper-pm-dist-e2e-merge-"));
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
    await git(w1, ["push", "-u", "origin", "main"]);

    const temp1 = join(base, "tmp1");
    const init1 = invokeBundled(["--sync", "off", "init"], {
      repoRoot: w1,
      tempDir: temp1,
      actor: "w1",
    });
    expect(init1.code).toBe(ExitCode.Success);

    await git(w1, ["add", ".hyper-pm"]);
    await git(w1, ["commit", "-m", "config"]);
    await git(w1, ["push", "origin", "main"]);

    const epicW1 = invokeBundled(
      ["epic", "create", "--id", "ep-dist-merge-a", "--title", "From W1"],
      { repoRoot: w1, tempDir: temp1, actor: "w1" },
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

    // Act — ensure distinct event shard filenames (wall-clock based)
    await sleep(5);
    const epicW2 = invokeBundled(
      ["epic", "create", "--id", "ep-dist-merge-b", "--title", "From W2"],
      { repoRoot: w2, tempDir: temp2, actor: "w2" },
    );
    expect(epicW2.code).toBe(ExitCode.Success);
    await git(w2, ["push", "-u", "origin", "hyper-pm-data"]);

    // Act — merge remote data branch into w1
    await git(w1, ["fetch", "origin"]);
    await git(w1, ["checkout", "hyper-pm-data"]);
    await git(w1, ["merge", "origin/hyper-pm-data", "--no-edit"]);

    await git(w1, ["checkout", "main"]);

    const doctorMerged = invokeBundled(["doctor"], {
      repoRoot: w1,
      tempDir: temp1,
    });
    expect(doctorMerged.code).toBe(ExitCode.Success);

    const listAfter = invokeBundled(["epic", "read"], {
      repoRoot: w1,
      tempDir: temp1,
    });
    expect(listAfter.code).toBe(ExitCode.Success);
    const items = (listAfter.json as { items?: { id: string }[] }).items ?? [];
    const ids = new Set(items.map((i) => i.id));
    expect(ids.has("ep-dist-merge-a")).toBe(true);
    expect(ids.has("ep-dist-merge-b")).toBe(true);
  }, 120_000);
});
