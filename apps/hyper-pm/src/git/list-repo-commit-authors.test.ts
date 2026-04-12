import { describe, expect, it } from "vitest";
import { listRepoCommitAuthors } from "./list-repo-commit-authors";
import type { runGit } from "./run-git";

describe("listRepoCommitAuthors", () => {
  it("returns empty when git prints nothing", async () => {
    const git: typeof runGit = async () => ({ stdout: "", stderr: "" });
    const rows = await listRepoCommitAuthors("/repo", git);
    expect(rows).toEqual([]);
  });

  it("dedupes by email and preserves first-seen order", async () => {
    const git: typeof runGit = async () => ({
      stdout: [
        "Alice\x1falice@users.noreply.github.com",
        "Bob\x1fbob@example.com",
        "Alice Other\x1falice@users.noreply.github.com",
      ].join("\n"),
      stderr: "",
    });
    const rows = await listRepoCommitAuthors("/repo", git);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.email).toBe("alice@users.noreply.github.com");
    expect(rows[0]?.loginGuess).toBe("alice");
    expect(rows[1]?.email).toBe("bob@example.com");
    expect(rows[1]?.loginGuess).toBe("bob");
  });

  it("returns empty on git failure", async () => {
    const git: typeof runGit = async () => {
      throw new Error("git failed");
    };
    const rows = await listRepoCommitAuthors("/repo", git);
    expect(rows).toEqual([]);
  });
});
