/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { parseClosingIssueRefsFromText } from "./parse-closing-issue-refs-from-text";

describe("parseClosingIssueRefsFromText", () => {
  it("parses Closes #n in a markdown section", () => {
    // Act
    const out = parseClosingIssueRefsFromText(
      "## Related issues\n\nCloses #213\n\n## Other",
    );

    // Assert
    expect(out).toEqual([213]);
  });

  it("collects multiple refs after one keyword", () => {
    // Act
    const out = parseClosingIssueRefsFromText("Closes #1, #2 and Fixes #3");

    // Assert
    expect(out).toEqual([1, 2, 3]);
  });

  it("returns empty when no keywords", () => {
    // Act
    const out = parseClosingIssueRefsFromText("Just #99 in prose");

    // Assert
    expect(out).toEqual([]);
  });
});
