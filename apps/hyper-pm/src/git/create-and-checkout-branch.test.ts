/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAndCheckoutBranch } from "./create-and-checkout-branch";
import type { RunGitLike } from "./create-and-checkout-branch";

describe("createAndCheckoutBranch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs git switch -c with branch and start point", async () => {
    // Setup
    const git = vi.fn(async () => ({
      stdout: "",
      stderr: "",
    })) as unknown as RunGitLike;

    // Act
    await createAndCheckoutBranch({
      repoRoot: "/repo",
      branchName: "hyper-pm/x",
      startPoint: "refs/heads/main",
      runGit: git,
    });

    // Assert
    expect(git).toHaveBeenCalledWith("/repo", [
      "switch",
      "-c",
      "hyper-pm/x",
      "refs/heads/main",
    ]);
  });
});
