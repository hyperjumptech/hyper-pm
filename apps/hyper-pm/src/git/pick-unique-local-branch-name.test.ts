/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { pickUniqueLocalBranchName } from "./pick-unique-local-branch-name";
import type { RunGitLike } from "./pick-unique-local-branch-name";

describe("pickUniqueLocalBranchName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns preferred base when no local branch exists", async () => {
    // Setup
    const git = vi.fn(async () => {
      throw new Error("no ref");
    }) as unknown as RunGitLike;

    // Act
    const out = await pickUniqueLocalBranchName({
      repoRoot: "/r",
      preferredBase: "hyper-pm/t-1",
      runGit: git,
    });

    // Assert
    expect(out).toEqual({ branch: "hyper-pm/t-1", preferred: "hyper-pm/t-1" });
    expect(git).toHaveBeenCalledWith("/r", [
      "show-ref",
      "--verify",
      "refs/heads/hyper-pm/t-1",
    ]);
  });

  it("appends numeric suffix until a free name is found", async () => {
    // Setup
    const git = vi.fn(async (_cwd: string, args: string[]) => {
      const ref = args[2] as string;
      if (
        ref === "refs/heads/hyper-pm/t-1" ||
        ref === "refs/heads/hyper-pm/t-1-2"
      ) {
        return { stdout: ref, stderr: "" };
      }
      throw new Error("missing");
    }) as unknown as RunGitLike;

    // Act
    const out = await pickUniqueLocalBranchName({
      repoRoot: "/r",
      preferredBase: "hyper-pm/t-1",
      runGit: git,
    });

    // Assert
    expect(out.branch).toBe("hyper-pm/t-1-3");
    expect(out.preferred).toBe("hyper-pm/t-1");
  });

  it("throws when max suffix is exhausted", async () => {
    // Setup
    const git = vi.fn(async () => ({
      stdout: "x",
      stderr: "",
    })) as unknown as RunGitLike;

    // Act & Assert
    await expect(
      pickUniqueLocalBranchName({
        repoRoot: "/r",
        preferredBase: "b",
        runGit: git,
        maxSuffix: 2,
      }),
    ).rejects.toThrow("Could not allocate a free local branch name");
  });
});
