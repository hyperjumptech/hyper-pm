/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";

import type { runGit as runGitFn } from "./run-git";
import { tryReadGithubOwnerRepoSlugFromGit } from "./try-read-github-owner-repo-slug-from-git";

describe("tryReadGithubOwnerRepoSlugFromGit", () => {
  it("returns owner/repo when git remote succeeds", async () => {
    // Setup
    const runGit = vi.fn(async () => ({
      stdout: "git@github.com:acme/app.git\n",
      stderr: "",
    })) as unknown as typeof runGitFn;

    // Act
    const slug = await tryReadGithubOwnerRepoSlugFromGit({
      repoRoot: "/repo",
      remote: "origin",
      runGit,
    });

    // Assert
    expect(slug).toBe("acme/app");
    expect(runGit).toHaveBeenCalledWith("/repo", [
      "remote",
      "get-url",
      "origin",
    ]);
  });

  it("returns undefined when git remote fails", async () => {
    // Setup
    const runGit = vi.fn(async () => {
      throw new Error("no remote");
    }) as unknown as typeof runGitFn;

    // Act
    const slug = await tryReadGithubOwnerRepoSlugFromGit({
      repoRoot: "/repo",
      remote: "upstream",
      runGit,
    });

    // Assert
    expect(slug).toBeUndefined();
  });
});
