import type { runGit as runGitFn } from "../git/run-git";

/**
 * Extracts a single-line message from an unknown thrown value (git stderr is often in `Error.message`).
 *
 * @param err - Value caught from a failed git invocation.
 */
const firstLineFromUnknown = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.trim().split("\n")[0]?.trim() ?? raw.trim();
  return line.length > 0 ? line : "git error";
};

export type TryPushDataBranchStatus = "pushed" | "skipped_no_remote" | "failed";

export type TryPushDataBranchResult = {
  status: TryPushDataBranchStatus;
  /** Present when push did not complete successfully. */
  detail?: string;
};

/**
 * Attempts `git push -u` for the data branch without throwing: missing remotes or push
 * errors return a structured result so callers can finish sync successfully.
 *
 * @param worktreePath - Absolute root of the data-branch checkout.
 * @param remote - Git remote name (for example `origin`).
 * @param branch - Short branch name (for example `hyper-pm-data`).
 * @param runGit - Injectable git runner used elsewhere in the CLI.
 */
export const tryPushDataBranchToRemote = async (
  worktreePath: string,
  remote: string,
  branch: string,
  runGit: typeof runGitFn,
): Promise<TryPushDataBranchResult> => {
  try {
    await runGit(worktreePath, ["remote", "get-url", remote]);
  } catch (e) {
    return {
      status: "skipped_no_remote",
      detail: firstLineFromUnknown(e),
    };
  }
  try {
    await runGit(worktreePath, ["push", "-u", remote, branch]);
    return { status: "pushed" };
  } catch (e) {
    return {
      status: "failed",
      detail: firstLineFromUnknown(e),
    };
  }
};
