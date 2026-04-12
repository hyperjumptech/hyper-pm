import type { runGit as runGitFn } from "./run-git";

/** Optional env slice used to fill missing git `user.*` for data-branch commits. */
export type GitAuthorEnvSlice = {
  HYPER_PM_GIT_USER_NAME?: string | undefined;
  HYPER_PM_GIT_USER_EMAIL?: string | undefined;
  GIT_AUTHOR_NAME?: string | undefined;
  GIT_AUTHOR_EMAIL?: string | undefined;
};

const defaultDataCommitName = "hyper-pm";
const defaultDataCommitEmail = "hyper-pm@users.noreply.github.com";

/**
 * Reads `git config --get user.name` (or empty when unset), swallowing git errors.
 *
 * @param cwd - Repository or worktree root passed to git.
 * @param runGit - Injectable git runner.
 */
const tryReadGitConfigUserName = async (
  cwd: string,
  runGit: typeof runGitFn,
): Promise<string> => {
  try {
    const { stdout } = await runGit(cwd, ["config", "--get", "user.name"]);
    return stdout.trim();
  } catch {
    return "";
  }
};

/**
 * Reads `git config --get user.email` (or empty when unset), swallowing git errors.
 *
 * @param cwd - Repository or worktree root passed to git.
 * @param runGit - Injectable git runner.
 */
const tryReadGitConfigUserEmail = async (
  cwd: string,
  runGit: typeof runGitFn,
): Promise<string> => {
  try {
    const { stdout } = await runGit(cwd, ["config", "--get", "user.email"]);
    return stdout.trim();
  } catch {
    return "";
  }
};

/**
 * Resolves `user.name` / `user.email` for hyper-pm data-branch commits so `git commit`
 * never fails solely due to missing identity: prefers existing git config, then env,
 * then stable defaults.
 *
 * @param cwd - Data worktree root.
 * @param runGit - Injectable git runner.
 * @param authorEnv - Environment slice (production callers pass `@workspace/env`).
 */
export const resolveEffectiveGitAuthorForDataCommit = async (
  cwd: string,
  runGit: typeof runGitFn,
  authorEnv: GitAuthorEnvSlice,
): Promise<{ name: string; email: string }> => {
  const fromGitName = await tryReadGitConfigUserName(cwd, runGit);
  const fromGitEmail = await tryReadGitConfigUserEmail(cwd, runGit);
  const name =
    fromGitName ||
    authorEnv.HYPER_PM_GIT_USER_NAME?.trim() ||
    authorEnv.GIT_AUTHOR_NAME?.trim() ||
    defaultDataCommitName;
  const email =
    fromGitEmail ||
    authorEnv.HYPER_PM_GIT_USER_EMAIL?.trim() ||
    authorEnv.GIT_AUTHOR_EMAIL?.trim() ||
    defaultDataCommitEmail;
  return { name, email };
};
