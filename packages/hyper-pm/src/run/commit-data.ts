import type { runGit as runGitFn } from "../git/run-git";

/**
 * Commits all changes inside a data worktree when there is something to record.
 *
 * @param worktreePath - Disposable worktree root (data branch checkout).
 * @param message - Commit message suffix.
 * @param runGit - Injectable git runner.
 */
export const commitDataWorktreeIfNeeded = async (
  worktreePath: string,
  message: string,
  runGit: typeof runGitFn,
): Promise<void> => {
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
  if (!stdout.trim()) return;
  await runGit(worktreePath, ["add", "."]);
  await runGit(worktreePath, ["commit", "-m", message]);
};
