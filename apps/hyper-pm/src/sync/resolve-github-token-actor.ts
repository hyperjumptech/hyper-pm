import type { Octokit } from "@octokit/rest";

/** Injectable piece of Octokit used by {@link resolveGithubTokenActor}. */
export type GetAuthenticatedUser = () => Promise<{
  data: { login?: string | null };
}>;

/**
 * Returns `github:<login>` when the token can read the authenticated user; otherwise `github-sync`.
 *
 * @param octokit - REST client (used when `getAuthenticated` is omitted).
 * @param deps - Optional override for tests.
 */
export const resolveGithubTokenActor = async (
  octokit: Octokit,
  deps: {
    getAuthenticated?: GetAuthenticatedUser;
  } = {},
): Promise<string> => {
  const getAuthenticated =
    deps.getAuthenticated ?? (() => octokit.rest.users.getAuthenticated());
  try {
    const { data } = await getAuthenticated();
    const login = data.login?.trim();
    if (login) {
      return `github:${login}`;
    }
  } catch {
    // Token may lack user read scope.
  }
  return "github-sync";
};
