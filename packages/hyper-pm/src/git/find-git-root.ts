import type { runGit as runGitFn } from "./run-git";

/**
 * Resolves the git repository root for a working tree using `git rev-parse`.
 *
 * @param cwd - Directory to start resolution from (typically the user's cwd).
 * @param deps - Injectable git runner (defaults to production {@link runGit}).
 */
export const findGitRoot = async (
  cwd: string,
  deps: {
    runGit: typeof runGitFn;
  },
): Promise<string> => {
  const { stdout } = await deps.runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return stdout;
};
