import { runGit } from "./run-git";

/** Git runner compatible with {@link runGit}. */
export type RunGitLike = typeof runGit;

/**
 * Creates and checks out a new local branch from `startPoint` in the primary worktree.
 *
 * @param opts.repoRoot - Primary repository working tree.
 * @param opts.branchName - Final local branch name (caller must ensure uniqueness).
 * @param opts.startPoint - Ref, branch, or commit for `git switch -c`.
 * @param opts.runGit - Injectable git runner.
 */
export const createAndCheckoutBranch = async (opts: {
  repoRoot: string;
  branchName: string;
  startPoint: string;
  runGit: RunGitLike;
}): Promise<void> => {
  await opts.runGit(opts.repoRoot, [
    "switch",
    "-c",
    opts.branchName,
    opts.startPoint,
  ]);
};
