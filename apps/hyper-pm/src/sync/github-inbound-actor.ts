/**
 * Builds the JSONL `actor` for a GitHub-driven inbound ticket update.
 * Uses the **issue author's** GitHub login when present; that may differ from whoever last edited the issue.
 *
 * @param issue - GitHub issue payload (or minimal `{ user }` slice).
 */
export const githubInboundActorFromIssue = (issue: {
  user?: { login?: string | null } | null;
}): string => {
  const login = issue.user?.login?.trim();
  if (login) {
    return `github:${login}`;
  }
  return "github-inbound";
};
