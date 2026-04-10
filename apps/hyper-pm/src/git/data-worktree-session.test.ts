/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openDataBranchWorktree,
  parseDataBranchWorktreeFromPorcelain,
} from "./data-worktree-session";

describe("parseDataBranchWorktreeFromPorcelain", () => {
  it("returns the path when a block matches the branch", () => {
    // Act
    const path = parseDataBranchWorktreeFromPorcelain(
      [
        "worktree /repo",
        "HEAD abc",
        "branch refs/heads/main",
        "",
        "worktree /data-wt",
        "HEAD def",
        "branch refs/heads/hyper-pm-data",
        "",
      ].join("\n"),
      "hyper-pm-data",
    );

    // Assert
    expect(path).toBe("/data-wt");
  });

  it("returns undefined when no block matches", () => {
    // Act
    const path = parseDataBranchWorktreeFromPorcelain(
      ["worktree /repo", "HEAD abc", "branch refs/heads/main", ""].join("\n"),
      "hyper-pm-data",
    );

    // Assert
    expect(path).toBeUndefined();
  });

  it("returns undefined for detached worktrees (no branch line)", () => {
    // Act
    const path = parseDataBranchWorktreeFromPorcelain(
      ["worktree /repo", "HEAD abc", "detached", ""].join("\n"),
      "hyper-pm-data",
    );

    // Assert
    expect(path).toBeUndefined();
  });
});

describe("openDataBranchWorktree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const listOnlyMain = [
    "worktree /repo",
    "HEAD 60fa9227d9aacbca7802dc8715a1cdd828392217",
    "branch refs/heads/main",
    "",
  ].join("\n");

  it("registers worktree and removes it on dispose", async () => {
    // Setup
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: listOnlyMain, stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    // Act
    const session = await openDataBranchWorktree({
      repoRoot: "/repo",
      dataBranch: "hyper-pm-data",
      tmpBase: "/tmp",
      runGit,
      keepWorktree: false,
    });

    // Assert
    expect(session.worktreePath).toMatch(/hyper-pm-worktree-[0-9a-z]+$/);
    expect(runGit).toHaveBeenNthCalledWith(1, "/repo", [
      "worktree",
      "list",
      "--porcelain",
    ]);
    expect(runGit).toHaveBeenNthCalledWith(2, "/repo", [
      "worktree",
      "add",
      session.worktreePath,
      "hyper-pm-data",
    ]);

    await session.dispose();

    expect(runGit).toHaveBeenNthCalledWith(3, "/repo", [
      "worktree",
      "remove",
      "--force",
      session.worktreePath,
    ]);
  });

  it("skips remove when keepWorktree is true", async () => {
    // Setup
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: listOnlyMain, stderr: "" })
      .mockResolvedValue({ stdout: "", stderr: "" });

    // Act
    const session = await openDataBranchWorktree({
      repoRoot: "/repo",
      dataBranch: "hyper-pm-data",
      tmpBase: "/tmp",
      runGit,
      keepWorktree: true,
    });

    await session.dispose();

    // Assert
    expect(runGit).toHaveBeenCalledTimes(2);
  });

  it("reuses an existing worktree path when the branch is already checked out", async () => {
    // Setup
    const existingPath = "/private/var/folders/tmp/hyper-pm-worktree-existing";
    const listOut = [
      `worktree /repo`,
      `HEAD abc`,
      `branch refs/heads/main`,
      "",
      `worktree ${existingPath}`,
      `HEAD def`,
      `branch refs/heads/hyper-pm-data`,
      "",
    ].join("\n");

    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: listOut, stderr: "" });
    const pathExists = vi.fn().mockResolvedValue(true);

    // Act
    const session = await openDataBranchWorktree({
      repoRoot: "/repo",
      dataBranch: "hyper-pm-data",
      tmpBase: "/tmp",
      runGit,
      keepWorktree: false,
      pathExists,
    });

    await session.dispose();

    // Assert
    expect(session.worktreePath).toBe(existingPath);
    expect(runGit).toHaveBeenCalledTimes(1);
    expect(pathExists).toHaveBeenCalledWith(existingPath);
  });

  it("creates a new worktree when listed path is missing on disk", async () => {
    // Setup
    const stalePath = "/missing/wt";
    const listOut = [
      `worktree /repo`,
      `HEAD abc`,
      `branch refs/heads/main`,
      "",
      `worktree ${stalePath}`,
      `HEAD def`,
      `branch refs/heads/hyper-pm-data`,
      "",
    ].join("\n");

    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: listOut, stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const pathExists = vi.fn().mockResolvedValue(false);

    // Act
    const session = await openDataBranchWorktree({
      repoRoot: "/repo",
      dataBranch: "hyper-pm-data",
      tmpBase: "/tmp",
      runGit,
      keepWorktree: false,
      pathExists,
    });

    await session.dispose();

    // Assert
    expect(session.worktreePath).toMatch(/hyper-pm-worktree-[0-9a-z]+$/);
    expect(pathExists).toHaveBeenCalledWith(stalePath);
    expect(runGit).toHaveBeenNthCalledWith(2, "/repo", [
      "worktree",
      "add",
      session.worktreePath,
      "hyper-pm-data",
    ]);
  });
});
