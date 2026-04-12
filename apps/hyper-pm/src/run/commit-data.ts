import { env } from "@workspace/env";
import type { runGit as runGitFn } from "../git/run-git";
import {
  resolveEffectiveGitAuthorForDataCommit,
  type GitAuthorEnvSlice,
} from "../git/resolve-effective-git-author-for-data-commit";

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
 * Uses per-invocation `git -c user.name=… -c user.email=… commit` so commits succeed
 * even when the repo has no local `user.name` / `user.email`, resolving identity from
 * git config, then `HYPER_PM_GIT_USER_*` / `GIT_AUTHOR_*`, then built-in defaults.
 *
 * @param worktreePath - Disposable worktree root (data branch checkout).
 * @param message - Full `git commit -m` message.
 * @param runGit - Injectable git runner.
 * @param opts - Optional overrides (tests inject `authorEnv`).
 */
export const commitDataWorktreeIfNeeded = async (
  worktreePath: string,
  message: string,
  runGit: typeof runGitFn,
  opts?: { authorEnv?: GitAuthorEnvSlice },
): Promise<void> => {
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain"]);
  if (!stdout.trim()) return;
  await runGit(worktreePath, ["add", "."]);
  const authorEnv = opts?.authorEnv ?? env;
  const { name, email } = await resolveEffectiveGitAuthorForDataCommit(
    worktreePath,
    runGit,
    authorEnv,
  );
  await runGit(worktreePath, [
    "-c",
    `user.name=${name}`,
    "-c",
    `user.email=${email}`,
    "commit",
    "-m",
    message,
  ]);
};
