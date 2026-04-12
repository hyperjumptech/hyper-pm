import { normalizeGithubLogin } from "../lib/github-assignee";
import { resolveGithubTokenForSync } from "./resolve-github-token-for-sync";

/** Injectable `resolveGithubTokenForSync` for tests. */
export type ResolveGithubTokenForSyncFn = typeof resolveGithubTokenForSync;

/**
 * Fetches the authenticated user's GitHub login using a bearer token.
 *
 * @param token - Non-empty GitHub API token.
 * @param fetchFn - `fetch` implementation (defaults to global `fetch`).
 * @returns Normalized login, or `null` when the response is not OK or JSON has no login.
 */
export const fetchGithubAuthenticatedLogin = async (
  token: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<string | null> => {
  const res = await fetchFn("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as { login?: string | null };
  const raw = data.login?.trim();
  if (!raw) {
    return null;
  }
  const normalized = normalizeGithubLogin(raw);
  return normalized === "" ? null : normalized;
};

/**
 * Resolves the current user's normalized GitHub login using `GITHUB_TOKEN` or `gh auth token`.
 *
 * @param params - Optional env token and repository cwd for the gh subprocess.
 * @param deps - Optional token resolver and login fetcher (production defaults apply).
 * @returns Normalized login, or `null` when no token is available or the user API yields no login.
 */
export const resolveAuthenticatedGithubLogin = async (
  params: {
    envToken: string | undefined;
    cwd: string;
  },
  deps: {
    resolveGithubTokenForSync?: ResolveGithubTokenForSyncFn;
    fetchGithubAuthenticatedLogin?: typeof fetchGithubAuthenticatedLogin;
  } = {},
): Promise<string | null> => {
  const resolveToken =
    deps.resolveGithubTokenForSync ?? resolveGithubTokenForSync;
  const token = await resolveToken({
    envToken: params.envToken,
    cwd: params.cwd,
  });
  if (token === null) {
    return null;
  }
  const fetchLogin =
    deps.fetchGithubAuthenticatedLogin ?? fetchGithubAuthenticatedLogin;
  return fetchLogin(token);
};
