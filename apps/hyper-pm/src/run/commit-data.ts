import type { runGit as runGitFn } from "../git/run-git";

const maxActorSuffixLen = 60;

/**
 * Builds a single-line git commit message with an optional truncated audit actor suffix.
 *
 * @param base - Primary subject (e.g. `hyper-pm: mutation`).
 * @param actorSuffix - Optional resolved actor; collapsed whitespace and capped in length.
 */
export const formatDataBranchCommitMessage = (
  base: string,
  actorSuffix?: string,
): string => {
  const raw = actorSuffix?.trim();
  if (!raw) {
    return base;
  }
  const collapsed = raw.replace(/\s+/g, " ");
  const suffix =
    collapsed.length > maxActorSuffixLen
      ? `${collapsed.slice(0, maxActorSuffixLen - 1)}…`
      : collapsed;
  return `${base} (${suffix})`;
};

/**
 * Commits all changes inside a data worktree when there is something to record.
 *
 * @param worktreePath - Disposable worktree root (data branch checkout).
 * @param message - Full `git commit -m` message.
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
