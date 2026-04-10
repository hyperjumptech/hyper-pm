import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { runGit as runGitFn } from "./run-git";

/**
 * Creates a new orphan data branch inside a freshly added worktree and records an initial commit.
 *
 * @param opts - Repository root, disposable worktree path, branch name, and git runner.
 */
export const initOrphanDataBranchInWorktree = async (opts: {
  repoRoot: string;
  worktreePath: string;
  dataBranch: string;
  runGit: typeof runGitFn;
}): Promise<void> => {
  const { stdout: tip } = await opts.runGit(opts.repoRoot, [
    "rev-parse",
    "HEAD",
  ]);
  const tipCommit = tip.trim();
  await opts.runGit(opts.repoRoot, [
    "worktree",
    "add",
    opts.worktreePath,
    tipCommit,
  ]);
  await opts.runGit(opts.worktreePath, [
    "checkout",
    "--orphan",
    opts.dataBranch,
  ]);
  await opts.runGit(opts.worktreePath, ["rm", "-rf", "."]).catch(() => {
    /* empty orphan */
  });
  const marker = join(opts.worktreePath, "README.hyper-pm.md");
  await writeFile(
    marker,
    "# hyper-pm data branch\n\nAppend-only events live under `events/`.\n",
    "utf8",
  );
  await opts.runGit(opts.worktreePath, ["add", "."]);
  await opts.runGit(opts.worktreePath, [
    "commit",
    "-m",
    "init hyper-pm data branch",
  ]);
};
