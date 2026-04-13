/** @vitest-environment node */
import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { loadOpenPrsByClosingIssueIndex } from "./load-open-prs-by-closing-issue-index";

describe("loadOpenPrsByClosingIssueIndex", () => {
  it("indexes PR numbers by issue number from search results", async () => {
    // Setup
    const paginate = vi.fn().mockResolvedValue([
      {
        number: 225,
        body: "## Related issues\n\nCloses #213\n",
      },
    ]);
    const octokit = {
      paginate,
      rest: {
        search: { issuesAndPullRequests: { endpoint: { merge: vi.fn() } } },
      },
    } as unknown as Octokit;

    // Act
    const map = await loadOpenPrsByClosingIssueIndex({
      octokit,
      owner: "hyperjumptech",
      repo: "mediapulse",
    });

    // Assert
    expect(paginate).toHaveBeenCalled();
    expect(map.get(213)).toEqual([225]);
  });

  it("returns empty map when search throws", async () => {
    // Setup
    const paginate = vi.fn().mockRejectedValue(new Error("rate limit"));
    const octokit = {
      paginate,
      rest: {
        search: { issuesAndPullRequests: { endpoint: { merge: vi.fn() } } },
      },
    } as unknown as Octokit;

    // Act
    const map = await loadOpenPrsByClosingIssueIndex({
      octokit,
      owner: "o",
      repo: "r",
    });

    // Assert
    expect(map.size).toBe(0);
  });
});
