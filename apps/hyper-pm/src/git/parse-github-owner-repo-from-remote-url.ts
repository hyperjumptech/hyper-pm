/**
 * Parses an `owner/repo` slug from a `git remote` URL when it targets **github.com**
 * (HTTPS, SSH, or `git@github.com:…` form).
 *
 * Enterprise hosts and non-GitHub remotes return `undefined` so callers do not
 * mis-associate API calls with github.com.
 *
 * @param rawUrl - Raw URL from `git remote get-url` (may include trailing newline).
 * @returns Normalized `owner/repo`, or `undefined` when parsing fails or host is not GitHub.com.
 */
export const parseGithubOwnerRepoFromRemoteUrl = (
  rawUrl: string,
): string | undefined => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  const scpMatch = /^git@github\.com:(?<path>.+)$/i.exec(trimmed);
  if (scpMatch?.groups?.path) {
    return slugFromGithubPath(scpMatch.groups.path);
  }

  try {
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") {
      return undefined;
    }
    return slugFromGithubPath(u.pathname);
  } catch {
    return undefined;
  }
};

/**
 * Interprets a GitHub HTTP path or scp-style path segment as `owner/repo`.
 *
 * @param path - Path after host (may start with `/`) or scp path after `:`.
 */
const slugFromGithubPath = (path: string): string | undefined => {
  const segments = path
    .replace(/^\/+/, "")
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/\.git$/i, ""));
  if (segments.length < 2) {
    return undefined;
  }
  const owner = segments[0];
  const repo = segments[1];
  if (!owner || !repo) {
    return undefined;
  }
  return `${owner}/${repo}`;
};
