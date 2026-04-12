import { runGit } from "./run-git";

/** Git runner compatible with {@link runGit}. */
export type RunGitLike = typeof runGit;

/**
 * Verifies that `ref` resolves to an object in `repoRoot` (suitable as `git switch -c` start point).
 *
 * @param repoRoot - Primary repository working tree.
 * @param ref - User-supplied ref or commit-ish.
 * @param git - Injectable git runner.
 * @throws Error when `ref` does not resolve.
 */
export const assertGitRefResolvable = async (
  repoRoot: string,
  ref: string,
  git: RunGitLike,
): Promise<void> => {
  try {
    await git(repoRoot, ["rev-parse", "-q", "--verify", ref]);
  } catch {
    throw new Error(`Invalid or ambiguous --from ref: ${ref}`);
  }
};

/**
 * Resolves the default integration branch (or `HEAD`) in the primary worktree for branching off.
 *
 * Order: `refs/remotes/<remote>/HEAD` target, then `refs/heads/main`, `refs/heads/master`, then `HEAD`.
 *
 * @param repoRoot - Primary repository working tree.
 * @param remote - Remote name (e.g. `origin` from config).
 * @param git - Injectable git runner.
 * @returns A ref string accepted by `git switch -c <new> <startPoint>`.
 * @throws Error when nothing resolves; message instructs passing `--from`.
 */
export const resolveIntegrationStartPoint = async (
  repoRoot: string,
  remote: string,
  git: RunGitLike,
): Promise<string> => {
  const symRef = `refs/remotes/${remote}/HEAD`;
  try {
    const { stdout } = await git(repoRoot, ["symbolic-ref", "-q", symRef]);
    const target = stdout.trim();
    if (target !== "") {
      await git(repoRoot, ["rev-parse", "-q", "--verify", target]);
      return target;
    }
  } catch {
    // try fallbacks below
  }
  for (const head of ["refs/heads/main", "refs/heads/master"] as const) {
    try {
      await git(repoRoot, ["rev-parse", "-q", "--verify", head]);
      return head;
    } catch {
      // next candidate
    }
  }
  try {
    await git(repoRoot, ["rev-parse", "-q", "--verify", "HEAD"]);
    return "HEAD";
  } catch {
    // fall through
  }
  throw new Error(
    "Could not resolve a default branch to branch from; pass --from <ref> (e.g. main or origin/main).",
  );
};
