import { normalizeTicketBranchName } from "../lib/normalize-ticket-branches";
import { runGit } from "./run-git";

/** Git runner compatible with {@link runGit}. */
export type RunGitLike = typeof runGit;

const DEFAULT_MAX_SUFFIX = 1000;

/**
 * Returns whether a local branch ref `refs/heads/<name>` exists.
 *
 * @param repoRoot - Primary repository working tree.
 * @param name - Branch name (no `refs/heads/` prefix).
 * @param git - Injectable git runner.
 */
const localBranchRefExists = async (
  repoRoot: string,
  name: string,
  git: RunGitLike,
): Promise<boolean> => {
  try {
    await git(repoRoot, ["show-ref", "--verify", `refs/heads/${name}`]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Picks a local branch name starting from `preferredBase`, appending `-2`, `-3`, … when `refs/heads/<name>` already exists.
 *
 * @param opts.repoRoot - Primary repository working tree.
 * @param opts.preferredBase - Already-normalized preferred name (caller must normalize).
 * @param opts.runGit - Injectable git runner.
 * @param opts.maxSuffix - Maximum numeric suffix (default 1000); throws if no free name.
 * @returns Chosen branch name and the preferred base (for CLI messaging when they differ).
 * @throws Error when no free name is found within the suffix cap or a constructed name is invalid.
 */
export const pickUniqueLocalBranchName = async (opts: {
  repoRoot: string;
  preferredBase: string;
  runGit: RunGitLike;
  maxSuffix?: number;
}): Promise<{ branch: string; preferred: string }> => {
  const max = opts.maxSuffix ?? DEFAULT_MAX_SUFFIX;
  const { preferredBase, repoRoot, runGit: git } = opts;
  for (let n = 1; n <= max; n += 1) {
    const raw = n === 1 ? preferredBase : `${preferredBase}-${n}`;
    const norm = normalizeTicketBranchName(raw);
    if (norm === undefined) {
      continue;
    }
    if (!(await localBranchRefExists(repoRoot, norm, git))) {
      return { branch: norm, preferred: preferredBase };
    }
  }
  throw new Error(
    `Could not allocate a free local branch name from ${JSON.stringify(preferredBase)} (tried suffixes up to -${String(max)})`,
  );
};
