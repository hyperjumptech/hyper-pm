/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  GITHUB_LABEL_NAME_MAX_LENGTH,
  isReservedHyperPmGithubLabel,
  labelNameFromGithubLabelEntry,
  mergeOutboundGithubIssueLabelsForTicket,
  ticketLabelsFromGithubIssueLabels,
} from "./github-issue-labels";

describe("isReservedHyperPmGithubLabel", () => {
  it("matches hyper-pm and ticket case-insensitively", () => {
    // Assert
    expect(isReservedHyperPmGithubLabel("hyper-pm")).toBe(true);
    expect(isReservedHyperPmGithubLabel("HYPER-PM")).toBe(true);
    expect(isReservedHyperPmGithubLabel("ticket")).toBe(true);
    expect(isReservedHyperPmGithubLabel("bug")).toBe(false);
  });
});

describe("labelNameFromGithubLabelEntry", () => {
  it("reads string or object name entries", () => {
    // Assert
    expect(labelNameFromGithubLabelEntry("  x  ")).toBe("x");
    expect(labelNameFromGithubLabelEntry({ name: "y" })).toBe("y");
    expect(labelNameFromGithubLabelEntry({})).toBeUndefined();
    expect(labelNameFromGithubLabelEntry(1)).toBeUndefined();
  });
});

describe("ticketLabelsFromGithubIssueLabels", () => {
  it("drops reserved labels and normalizes", () => {
    // Act
    const out = ticketLabelsFromGithubIssueLabels([
      "hyper-pm",
      "ticket",
      " bug ",
      "bug",
      { name: "a" },
    ]);

    // Assert
    expect(out).toEqual(["bug", "a"]);
  });

  it("returns empty for non-array", () => {
    // Act
    const out = ticketLabelsFromGithubIssueLabels("nope");

    // Assert
    expect(out).toEqual([]);
  });
});

describe("mergeOutboundGithubIssueLabelsForTicket", () => {
  it("prepends reserved labels and dedupes against ticket labels", () => {
    // Act
    const out = mergeOutboundGithubIssueLabelsForTicket([
      "hyper-pm",
      "bug",
      "bug",
    ]);

    // Assert
    expect(out).toEqual(["hyper-pm", "ticket", "bug"]);
  });

  it("skips labels longer than GitHub max length", () => {
    // Setup
    const long = "x".repeat(GITHUB_LABEL_NAME_MAX_LENGTH + 1);

    // Act
    const out = mergeOutboundGithubIssueLabelsForTicket(["ok", long]);

    // Assert
    expect(out).toEqual(["hyper-pm", "ticket", "ok"]);
  });
});
