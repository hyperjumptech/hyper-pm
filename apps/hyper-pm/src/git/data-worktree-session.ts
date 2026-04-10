import { access, mkdir, rm } from "node:fs/promises";
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
  /**
   * Returns whether a path is suitable to reuse as a worktree root (directory exists).
   * Injected for tests; defaults to `fs` access check.
   */
  pathExists?: (path: string) => Promise<boolean>;
};

const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

/** Default collaborator: returns true when `path` exists on disk. */
const defaultPathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Parses `git worktree list --porcelain` output and returns the absolute worktree path
 * already bound to `refs/heads/<dataBranch>`, if any.
 *
 * @param stdout - Trimmed stdout from `git worktree list --porcelain`.
 * @param dataBranch - Short branch name (e.g. `hyper-pm-data`).
 * @returns The matching worktree path, or `undefined` if none.
 */
export const parseDataBranchWorktreeFromPorcelain = (
  stdout: string,
  dataBranch: string,
): string | undefined => {
  const wantRef = `refs/heads/${dataBranch}`;
  const blocks = stdout
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    let worktreePath: string | undefined;
    let branch: string | undefined;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktreePath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        branch = line.slice("branch ".length);
      }
    }

    if (worktreePath !== undefined && branch === wantRef) {
      return worktreePath;
    }
  }

  return undefined;
};

/**
 * Creates a temp directory and registers a `git worktree` bound to an existing local branch,
 * or reuses an existing worktree directory when Git already has the branch checked out there.
 *
 * @param opts - Repository root, branch name, temp parent, and collaborators.
 */
export const openDataBranchWorktree = async (
  opts: OpenDataWorktreeOpts,
): Promise<DataWorktreeSession> => {
  const pathExists = opts.pathExists ?? defaultPathExists;

  const { stdout: listOut } = await opts.runGit(opts.repoRoot, [
    "worktree",
    "list",
    "--porcelain",
  ]);

  const listedPath = parseDataBranchWorktreeFromPorcelain(
    listOut,
    opts.dataBranch,
  );

  if (listedPath !== undefined && (await pathExists(listedPath))) {
    // Reused worktrees stay registered; do not remove another session's checkout.
    const dispose = async (): Promise<void> => {
      return;
    };
    return { worktreePath: listedPath, dispose };
  }

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
