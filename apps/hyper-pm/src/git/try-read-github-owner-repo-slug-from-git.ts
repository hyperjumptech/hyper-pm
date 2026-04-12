import type { runGit as runGitFn } from "./run-git";
import { parseGithubOwnerRepoFromRemoteUrl } from "./parse-github-owner-repo-from-remote-url";

/** Git runner compatible with {@link runGitFn}. */
export type RunGitLike = typeof runGitFn;

/**
 * Reads `git remote get-url <remote>` and derives `owner/repo` for github.com when possible.
 *
 * @param params - Repository root, remote name, and git runner.
 * @returns `owner/repo` slug, or `undefined` if the remote is missing or not a GitHub.com URL.
 */
export const tryReadGithubOwnerRepoSlugFromGit = async (params: {
  repoRoot: string;
  remote: string;
  runGit: RunGitLike;
}): Promise<string | undefined> => {
  try {
    const { stdout } = await params.runGit(params.repoRoot, [
      "remote",
      "get-url",
      params.remote,
    ]);
    return parseGithubOwnerRepoFromRemoteUrl(stdout);
  } catch {
    return undefined;
  }
};
