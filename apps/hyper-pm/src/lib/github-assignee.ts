/**
 * Normalizes a GitHub login for stable storage and API calls (trim + lowercase).
 *
 * @param login - Raw login from CLI or API.
 * @returns Normalized login, or empty string when only whitespace.
 */
export const normalizeGithubLogin = (login: string): string =>
  login.trim().toLowerCase();

/** Minimal GitHub issue slice needed to read assignees. */
export type GithubIssueAssigneeSlice = {
  assignees?: readonly { login?: string | null }[] | null;
};

/**
 * Returns the primary assignee login from a GitHub issue (first assignee with a login).
 * hyper-pm stores a single assignee; when GitHub has several, only the first is used.
 *
 * @param issue - Issue payload from the REST API (or tests).
 * @returns Normalized login, or `undefined` when there are no assignees.
 */
export const assigneeFromGithubIssue = (
  issue: GithubIssueAssigneeSlice,
): string | undefined => {
  const list = issue.assignees;
  if (!list || list.length === 0) return undefined;
  for (const a of list) {
    const raw = a.login?.trim();
    if (raw) return normalizeGithubLogin(raw);
  }
  return undefined;
};
