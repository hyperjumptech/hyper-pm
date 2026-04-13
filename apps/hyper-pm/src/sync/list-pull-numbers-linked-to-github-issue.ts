import type { Octokit } from "@octokit/rest";

/**
 * Scans GitHub issue timeline payloads for pull request numbers linked to that issue
 * (cross-references and `connected` events).
 *
 * @param items - Raw timeline rows from `issues.listEventsForTimeline` for a GitHub **issue** (not only body `Refs`).
 * @returns Sorted unique PR numbers.
 */
export const collectPullNumbersFromIssueTimelineItems = (
  items: readonly Record<string, unknown>[],
): number[] => {
  const out = new Set<number>();
  for (const item of items) {
    const ev = typeof item["event"] === "string" ? item["event"].trim() : "";
    if (ev === "cross-referenced") {
      const source = item["source"];
      if (source === null || typeof source !== "object") continue;
      const src = source as Record<string, unknown>;
      const issue = src["issue"];
      if (issue === null || typeof issue !== "object") continue;
      const iss = issue as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(iss, "pull_request")) {
        continue;
      }
      if (iss["pull_request"] == null) continue;
      const num = iss["number"];
      const prNum =
        typeof num === "number" && Number.isFinite(num)
          ? num
          : typeof num === "string" && /^\d+$/.test(num.trim())
            ? Number(num.trim())
            : NaN;
      if (Number.isFinite(prNum)) {
        out.add(prNum);
      }
      continue;
    }
    if (ev === "connected") {
      const subjectUrl = item["subject_url"];
      if (typeof subjectUrl !== "string") continue;
      const m = /\/pulls\/(\d+)\s*$/.exec(subjectUrl.trim());
      if (m === null) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n)) out.add(n);
    }
  }
  return [...out].sort((a, b) => a - b);
};

/**
 * Lists pull request numbers GitHub associates with the given issue (timeline API).
 *
 * @param params - REST client, repo coordinates, and GitHub issue number (same as `githubIssueNumber` on tickets).
 * @returns Sorted unique PR numbers; empty when the request fails (caller may catch).
 */
export const listPullNumbersLinkedToGithubIssue = async (params: {
  octokit: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;
}): Promise<number[]> => {
  const items = (await params.octokit.paginate(
    params.octokit.rest.issues.listEventsForTimeline,
    {
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      per_page: 100,
    },
  )) as Record<string, unknown>[];
  return collectPullNumbersFromIssueTimelineItems(items);
};
