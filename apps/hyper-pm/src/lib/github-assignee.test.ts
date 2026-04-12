import { describe, expect, it } from "vitest";
import {
  assigneeFromGithubIssue,
  normalizeGithubLogin,
} from "./github-assignee";

describe("normalizeGithubLogin", () => {
  it("trims and lowercases", () => {
    // Act
    const out = normalizeGithubLogin("  Alice  ");

    // Assert
    expect(out).toBe("alice");
  });

  it("returns empty string for whitespace-only", () => {
    // Act
    const out = normalizeGithubLogin("   \t");

    // Assert
    expect(out).toBe("");
  });
});

describe("assigneeFromGithubIssue", () => {
  it("returns undefined when assignees missing or empty", () => {
    // Act
    const a = assigneeFromGithubIssue({});
    const b = assigneeFromGithubIssue({ assignees: [] });
    const c = assigneeFromGithubIssue({ assignees: null });

    // Assert
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(c).toBeUndefined();
  });

  it("returns first normalized login", () => {
    // Setup
    const issue = {
      assignees: [{ login: "Bob" }, { login: "carol" }],
    };

    // Act
    const out = assigneeFromGithubIssue(issue);

    // Assert
    expect(out).toBe("bob");
  });

  it("skips assignees without login", () => {
    // Setup
    const issue = {
      assignees: [{ login: null }, { login: "  dave " }],
    };

    // Act
    const out = assigneeFromGithubIssue(issue);

    // Assert
    expect(out).toBe("dave");
  });
});
