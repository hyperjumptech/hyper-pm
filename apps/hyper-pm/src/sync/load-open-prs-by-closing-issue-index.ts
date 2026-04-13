import type { Octokit } from "@octokit/rest";
import { parseClosingIssueRefsFromText } from "./parse-closing-issue-refs-from-text";

/**
 * Lists open pull requests that GitHub considers linked to issues (`linked:issue`), then indexes them
 * by issue number parsed from PR bodies (Closes/Fixes/Resolves/Refs). Used when the issue timeline
 * omits cross-references the UI still shows.
 *
 * @param params - Authenticated REST client and repository coordinates.
 * @returns Map from GitHub issue number → sorted unique PR numbers claiming that issue in the body.
 */
export const loadOpenPrsByClosingIssueIndex = async (params: {
  octokit: Octokit;
  owner: string;
  repo: string;
}): Promise<Map<number, number[]>> => {
  const slug = `${params.owner}/${params.repo}`;
  const q = `repo:${slug} is:pr is:open linked:issue`;
  const map = new Map<number, Set<number>>();
  try {
    const items = (await params.octokit.paginate(
      params.octokit.rest.search.issuesAndPullRequests,
      { q, per_page: 100 },
    )) as { number: number; body: string | null | undefined }[];
    for (const item of items) {
      const prNum = item.number;
      if (!Number.isFinite(prNum)) continue;
      const body = typeof item.body === "string" ? item.body : "";
      for (const issueNum of parseClosingIssueRefsFromText(body)) {
        let set = map.get(issueNum);
        if (set === undefined) {
          set = new Set<number>();
          map.set(issueNum, set);
        }
        set.add(prNum);
      }
    }
  } catch {
    return new Map();
  }
  return new Map(
    [...map.entries()].map(([issueNum, prSet]) => [
      issueNum,
      [...prSet].sort((a, b) => a - b),
    ]),
  );
};
