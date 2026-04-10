import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ulid } from "ulid";
import type { runGit as runGitFn } from "./run-git";

/** Mutable session handle for a dedicated temp data-branch worktree. */
export type DataWorktreeSession = {
  /** Absolute path to the disposable worktree checkout. */
  worktreePath: string;
  /** Removes the worktree registration and deletes the directory when keepWorktree is false. */
  dispose: () => Promise<void>;
};

export type OpenDataWorktreeOpts = {
  repoRoot: string;
  dataBranch: string;
  tmpBase: string;
  /** When true, skip `git worktree remove` (debug / diagnostics). */
  keepWorktree?: boolean;
  runGit: typeof runGitFn;
};

const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

/**
 * Creates a temp directory and registers a `git worktree` bound to an existing local branch.
 *
 * @param opts - Repository root, branch name, temp parent, and collaborators.
 */
export const openDataBranchWorktree = async (
  opts: OpenDataWorktreeOpts,
): Promise<DataWorktreeSession> => {
  const worktreePath = join(
    opts.tmpBase,
    `hyper-pm-worktree-${ulid().toLowerCase()}`,
  );

  await ensureDir(opts.tmpBase);

  try {
    await opts.runGit(opts.repoRoot, [
      "worktree",
      "add",
      worktreePath,
      opts.dataBranch,
    ]);
  } catch (err) {
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  const dispose = async (): Promise<void> => {
    if (opts.keepWorktree) {
      return;
    }
    await opts
      .runGit(opts.repoRoot, ["worktree", "remove", "--force", worktreePath])
      .catch(() => {});
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  };

  return { worktreePath, dispose };
};
