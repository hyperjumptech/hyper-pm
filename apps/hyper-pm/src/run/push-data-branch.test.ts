/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { runGit as runGitFn } from "../git/run-git";
import { tryPushDataBranchToRemote } from "./push-data-branch";

describe("tryPushDataBranchToRemote", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns pushed when remote exists and push succeeds", async () => {
    // Setup
    const calls: { cwd: string; args: string[] }[] = [];
    const runGit: typeof runGitFn = async (cwd, args) => {
      calls.push({ cwd, args });
      return { stdout: "", stderr: "" };
    };

    // Act
    const out = await tryPushDataBranchToRemote(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
    );

    // Assert
    expect(out).toEqual({ status: "pushed" });
    expect(calls).toEqual([
      { cwd: "/wt", args: ["remote", "get-url", "origin"] },
      { cwd: "/wt", args: ["push", "-u", "origin", "hyper-pm-data"] },
    ]);
  });

  it("returns skipped_no_remote when remote get-url fails", async () => {
    // Setup
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") {
        throw new Error("fatal: No such remote 'upstream'");
      }
      return { stdout: "", stderr: "" };
    };

    // Act
    const out = await tryPushDataBranchToRemote(
      "/wt",
      "upstream",
      "hyper-pm-data",
      runGit,
    );

    // Assert
    expect(out.status).toBe("skipped_no_remote");
    expect(out.detail).toBe("fatal: No such remote 'upstream'");
  });

  it("returns failed when push fails after remote resolves", async () => {
    // Setup
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") {
        return { stdout: "https://github.com/o/r.git", stderr: "" };
      }
      if (args[0] === "push") {
        throw new Error("rejected\nnon-fast-forward");
      }
      return { stdout: "", stderr: "" };
    };

    // Act
    const out = await tryPushDataBranchToRemote(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
    );

    // Assert
    expect(out.status).toBe("failed");
    expect(out.detail).toBe("rejected");
  });
});
