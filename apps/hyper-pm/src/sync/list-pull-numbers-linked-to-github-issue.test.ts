/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { collectPullNumbersFromIssueTimelineItems } from "./list-pull-numbers-linked-to-github-issue";

describe("collectPullNumbersFromIssueTimelineItems", () => {
  it("collects PR numbers from cross-referenced timeline rows", () => {
    // Act
    const out = collectPullNumbersFromIssueTimelineItems([
      {
        event: "cross-referenced",
        source: {
          type: "issue",
          issue: {
            number: 225,
            pull_request: { url: "https://api.github.com/repos/o/r/pulls/225" },
          },
        },
      },
    ]);

    // Assert
    expect(out).toEqual([225]);
  });

  it("collects PR numbers from connected events", () => {
    // Act
    const out = collectPullNumbersFromIssueTimelineItems([
      {
        event: "connected",
        subject_url: "https://api.github.com/repos/o/r/pulls/88",
      },
    ]);

    // Assert
    expect(out).toEqual([88]);
  });

  it("ignores cross-references to plain issues without pull_request", () => {
    // Act
    const out = collectPullNumbersFromIssueTimelineItems([
      {
        event: "cross-referenced",
        source: {
          type: "issue",
          issue: { number: 99 },
        },
      },
    ]);

    // Assert
    expect(out).toEqual([]);
  });

  it("deduplicates and sorts ascending", () => {
    // Act
    const out = collectPullNumbersFromIssueTimelineItems([
      {
        event: "connected",
        subject_url: "https://api.github.com/repos/o/r/pulls/10",
      },
      {
        event: "cross-referenced",
        source: {
          issue: {
            number: 3,
            pull_request: {},
          },
        },
      },
      {
        event: "connected",
        subject_url: "https://api.github.com/repos/o/r/pulls/10",
      },
    ]);

    // Assert
    expect(out).toEqual([3, 10]);
  });
});
