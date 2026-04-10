/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { openDataBranchWorktree } from "./data-worktree-session";

describe("openDataBranchWorktree", () => {
  it("registers worktree and removes it on dispose", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const session = await openDataBranchWorktree({
      repoRoot: "/repo",
      dataBranch: "hyper-pm-data",
      tmpBase: "/tmp",
      runGit,
      keepWorktree: false,
    });

    expect(session.worktreePath).toMatch(/hyper-pm-worktree-[0-9a-z]+$/);
    expect(runGit).toHaveBeenNthCalledWith(1, "/repo", [
      "worktree",
      "add",
      session.worktreePath,
      "hyper-pm-data",
    ]);

    await session.dispose();

    expect(runGit).toHaveBeenNthCalledWith(2, "/repo", [
      "worktree",
      "remove",
      "--force",
      session.worktreePath,
    ]);
  });

  it("skips remove when keepWorktree is true", async () => {
    const runGit = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const session = await openDataBranchWorktree({
      repoRoot: "/repo",
      dataBranch: "hyper-pm-data",
      tmpBase: "/tmp",
      runGit,
      keepWorktree: true,
    });

    await session.dispose();

    expect(runGit).toHaveBeenCalledTimes(1);
  });
});
