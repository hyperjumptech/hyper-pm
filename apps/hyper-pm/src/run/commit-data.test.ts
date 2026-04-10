/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { formatDataBranchCommitMessage } from "./commit-data";

describe("formatDataBranchCommitMessage", () => {
  it("returns base when suffix is missing or blank", () => {
    // Act
    const a = formatDataBranchCommitMessage("hyper-pm: mutation");
    const b = formatDataBranchCommitMessage("hyper-pm: mutation", "   ");

    // Assert
    expect(a).toBe("hyper-pm: mutation");
    expect(b).toBe("hyper-pm: mutation");
  });

  it("appends trimmed suffix in parentheses", () => {
    // Act
    const out = formatDataBranchCommitMessage("hyper-pm: sync", "github:pat");

    // Assert
    expect(out).toBe("hyper-pm: sync (github:pat)");
  });

  it("collapses internal whitespace", () => {
    // Act
    const out = formatDataBranchCommitMessage("base", "cli:Alice\n  <a@b>");

    // Assert
    expect(out).toBe("base (cli:Alice <a@b>)");
  });

  it("truncates long suffix with ellipsis", () => {
    // Setup
    const long = "x".repeat(80);

    // Act
    const out = formatDataBranchCommitMessage("base", long);

    // Assert
    expect(out.startsWith("base (")).toBe(true);
    expect(out.endsWith("…)")).toBe(true);
    expect(out.length).toBeLessThan(long.length + 10);
  });
});
