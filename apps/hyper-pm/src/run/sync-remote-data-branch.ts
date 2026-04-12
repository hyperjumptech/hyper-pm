import { env } from "@workspace/env";
import type { runGit as runGitFn } from "../git/run-git";
import {
  resolveEffectiveGitAuthorForDataCommit,
  type GitAuthorEnvSlice,
} from "../git/resolve-effective-git-author-for-data-commit";
import {
  tryPushDataBranchToRemote,
  type TryPushDataBranchResult,
} from "./push-data-branch";

/** Outcome of updating `refs/remotes/<remote>/<dataBranch>` from the network. */
export type RemoteDataBranchFetchStatus =
  | "ok"
  | "skipped_no_remote"
  | "remote_branch_absent";

/** Outcome of merging the remote-tracking branch into the checked-out data branch. */
export type RemoteDataBranchMergeStatus =
  | "skipped_no_remote"
  | "skipped_missing_remote_branch"
  | "up_to_date"
  | "fast_forward"
  | "merge_commit";

/** Structured result from {@link runRemoteDataBranchGitSync}. */
export type RemoteDataBranchGitSyncResult = {
  dataBranchFetch: RemoteDataBranchFetchStatus;
  dataBranchMerge: RemoteDataBranchMergeStatus;
  dataBranchPush: TryPushDataBranchResult["status"] | "skipped_cli";
  dataBranchPushDetail?: string;
  /** How many push attempts were made (including retries after non-fast-forward). */
  pushAttempts: number;
};

/** Thrown when `git merge` fails; merge is aborted when possible. */
export class SyncRemoteDataBranchMergeError extends Error {
  /** @param message - Human-readable reason (stderr excerpt or generic text). */
  constructor(message: string) {
    super(message);
    this.name = "SyncRemoteDataBranchMergeError";
  }
}

/**
 * Builds the remote-tracking ref used after `git fetch <remote> <dataBranch>`.
 *
 * @param remote - Remote short name (e.g. `origin`).
 * @param dataBranch - Local branch name tracked on the remote (e.g. `hyper-pm-data`).
 */
export const remoteTrackingRef = (remote: string, dataBranch: string): string =>
  `refs/remotes/${remote}/${dataBranch}`;

/**
 * Refspec argument passed to `git merge` (e.g. `origin/hyper-pm-data`).
 *
 * @param remote - Remote short name.
 * @param dataBranch - Branch name on that remote.
 */
export const mergeRefSpecifier = (remote: string, dataBranch: string): string =>
  `${remote}/${dataBranch}`;

/**
 * Returns true when a push failure detail likely indicates the remote advanced
 * (retry fetch + merge may recover).
 *
 * @param detail - First-line message from {@link tryPushDataBranchToRemote}.
 */
export const isLikelyNonFastForwardPushFailure = (
  detail: string | undefined,
): boolean => {
  if (detail === undefined) return false;
  const d = detail.toLowerCase();
  return d.includes("non-fast-forward") || d.includes("failed to push");
};

/**
 * Classifies `git merge` stdout/stderr after a successful exit to distinguish
 * fast-forward vs merge commit vs already up to date.
 *
 * @param combined - Concatenated stdout and stderr from merge.
 */
export const classifyMergeOutput = (
  combined: string,
): RemoteDataBranchMergeStatus => {
  const c = combined.toLowerCase();
  if (c.includes("already up to date")) {
    return "up_to_date";
  }
  if (c.includes("fast-forward")) {
    return "fast_forward";
  }
  return "merge_commit";
};

/**
 * Returns whether `git show-ref` finds the given ref.
 *
 * @param cwd - Worktree root.
 * @param ref - Full ref (e.g. `refs/remotes/origin/hyper-pm-data`).
 * @param runGit - Injectable git runner.
 */
export const refExists = async (
  cwd: string,
  ref: string,
  runGit: typeof runGitFn,
): Promise<boolean> => {
  try {
    await runGit(cwd, ["show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Runs `git fetch <remote> <dataBranch>` from the worktree, or records skip when
 * the remote URL is missing. When the branch does not exist on the remote yet,
 * returns `remote_branch_absent` without throwing.
 *
 * @param worktreePath - Data-branch worktree root.
 * @param remote - Remote name.
 * @param dataBranch - Branch to fetch from the remote.
 * @param runGit - Injectable git runner.
 */
export const fetchRemoteDataBranch = async (
  worktreePath: string,
  remote: string,
  dataBranch: string,
  runGit: typeof runGitFn,
): Promise<RemoteDataBranchFetchStatus> => {
  try {
    await runGit(worktreePath, ["remote", "get-url", remote]);
  } catch {
    return "skipped_no_remote";
  }
  try {
    await runGit(worktreePath, ["fetch", remote, dataBranch]);
    return "ok";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/couldn't find remote ref|could not find remote ref/i.test(msg)) {
      return "remote_branch_absent";
    }
    throw e;
  }
};

/**
 * Merges the remote-tracking branch into HEAD using `--no-edit`, setting author
 * identity for possible merge commits. Aborts the merge on failure and throws
 * {@link SyncRemoteDataBranchMergeError}.
 *
 * @param worktreePath - Data-branch worktree root (branch checked out).
 * @param remote - Remote name.
 * @param dataBranch - Branch name merged from `remote/dataBranch`.
 * @param runGit - Injectable git runner.
 * @param authorEnv - Env slice for author resolution (tests may inject).
 */
export const mergeRemoteTrackingIntoHead = async (
  worktreePath: string,
  remote: string,
  dataBranch: string,
  runGit: typeof runGitFn,
  authorEnv: GitAuthorEnvSlice = env,
): Promise<RemoteDataBranchMergeStatus> => {
  const spec = mergeRefSpecifier(remote, dataBranch);
  const { name, email } = await resolveEffectiveGitAuthorForDataCommit(
    worktreePath,
    runGit,
    authorEnv,
  );
  try {
    const { stdout, stderr } = await runGit(worktreePath, [
      "-c",
      `user.name=${name}`,
      "-c",
      `user.email=${email}`,
      "merge",
      "--no-edit",
      spec,
    ]);
    return classifyMergeOutput(`${stdout}\n${stderr}`);
  } catch (e) {
    await runGit(worktreePath, ["merge", "--abort"]).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    throw new SyncRemoteDataBranchMergeError(
      msg.toLowerCase().includes("conflict")
        ? "Merge conflict while syncing hyper-pm data branch; merge aborted. Resolve manually on the data branch if needed."
        : `git merge failed: ${msg.trim().split("\n")[0] ?? msg}`,
    );
  }
};

export type RunRemoteDataBranchGitSyncDeps = {
  /** Injectable push helper (default: {@link tryPushDataBranchToRemote}). */
  tryPush?: (
    worktreePath: string,
    remote: string,
    dataBranch: string,
    runGit: typeof runGitFn,
  ) => Promise<TryPushDataBranchResult>;
  /** Max push attempts including retries after likely non-fast-forward (default: 3). */
  maxPushAttempts?: number;
  /** Env slice for merge author (default: `@workspace/env`). */
  authorEnv?: GitAuthorEnvSlice;
};

/**
 * Fetches the remote data branch, merges it into the current worktree HEAD when
 * the tracking ref exists, then pushes (unless `skipPush`) with bounded retries
 * after likely non-fast-forward races.
 *
 * @param worktreePath - Data-branch worktree root.
 * @param remote - Remote name.
 * @param dataBranch - Data branch short name.
 * @param runGit - Injectable git runner.
 * @param skipPush - When true, skips push and sets `dataBranchPush` to `skipped_cli`.
 * @param deps - Optional `tryPush`, `maxPushAttempts`, `authorEnv`.
 */
export const runRemoteDataBranchGitSync = async (
  worktreePath: string,
  remote: string,
  dataBranch: string,
  runGit: typeof runGitFn,
  skipPush: boolean,
  deps: RunRemoteDataBranchGitSyncDeps = {},
): Promise<RemoteDataBranchGitSyncResult> => {
  const tryPushFn = deps.tryPush ?? tryPushDataBranchToRemote;
  const maxPushAttempts = deps.maxPushAttempts ?? 3;
  const authorEnv = deps.authorEnv ?? env;

  let dataBranchFetch: RemoteDataBranchFetchStatus =
    await fetchRemoteDataBranch(worktreePath, remote, dataBranch, runGit);

  let dataBranchMerge: RemoteDataBranchMergeStatus =
    dataBranchFetch === "skipped_no_remote"
      ? "skipped_no_remote"
      : dataBranchFetch === "remote_branch_absent"
        ? "skipped_missing_remote_branch"
        : "up_to_date";

  if (dataBranchFetch === "ok") {
    const tracking = remoteTrackingRef(remote, dataBranch);
    const exists = await refExists(worktreePath, tracking, runGit);
    if (!exists) {
      dataBranchMerge = "skipped_missing_remote_branch";
    } else {
      dataBranchMerge = await mergeRemoteTrackingIntoHead(
        worktreePath,
        remote,
        dataBranch,
        runGit,
        authorEnv,
      );
    }
  }

  if (skipPush) {
    return {
      dataBranchFetch,
      dataBranchMerge,
      dataBranchPush: "skipped_cli",
      dataBranchPushDetail: "skip-push",
      pushAttempts: 0,
    };
  }

  let pushAttempts = 0;
  let lastPush: TryPushDataBranchResult = { status: "skipped_no_remote" };

  const refetchAndMerge = async (): Promise<void> => {
    dataBranchFetch = await fetchRemoteDataBranch(
      worktreePath,
      remote,
      dataBranch,
      runGit,
    );
    if (dataBranchFetch !== "ok") {
      return;
    }
    const tracking = remoteTrackingRef(remote, dataBranch);
    const exists = await refExists(worktreePath, tracking, runGit);
    if (!exists) {
      return;
    }
    dataBranchMerge = await mergeRemoteTrackingIntoHead(
      worktreePath,
      remote,
      dataBranch,
      runGit,
      authorEnv,
    );
  };

  for (let attempt = 1; attempt <= maxPushAttempts; attempt += 1) {
    pushAttempts = attempt;
    lastPush = await tryPushFn(worktreePath, remote, dataBranch, runGit);
    if (
      lastPush.status === "pushed" ||
      lastPush.status === "skipped_no_remote"
    ) {
      break;
    }
    if (
      lastPush.status === "failed" &&
      isLikelyNonFastForwardPushFailure(lastPush.detail) &&
      attempt < maxPushAttempts
    ) {
      await refetchAndMerge();
      continue;
    }
    break;
  }

  return {
    dataBranchFetch,
    dataBranchMerge,
    dataBranchPush: lastPush.status,
    ...(lastPush.detail !== undefined
      ? { dataBranchPushDetail: lastPush.detail }
      : {}),
    pushAttempts,
  };
};
