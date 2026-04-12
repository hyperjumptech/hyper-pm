/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { runGit as runGitFn } from "../git/run-git";
import {
  classifyMergeOutput,
  fetchRemoteDataBranch,
  isLikelyNonFastForwardPushFailure,
  mergeRefSpecifier,
  mergeRemoteTrackingIntoHead,
  refExists,
  remoteTrackingRef,
  runRemoteDataBranchGitSync,
  SyncRemoteDataBranchMergeError,
} from "./sync-remote-data-branch";

describe("SyncRemoteDataBranchMergeError", () => {
  it("sets name for instanceof checks", () => {
    const e = new SyncRemoteDataBranchMergeError("x");
    expect(e.name).toBe("SyncRemoteDataBranchMergeError");
    expect(e.message).toBe("x");
  });
});
import type { TryPushDataBranchResult } from "./push-data-branch";

describe("remoteTrackingRef", () => {
  it("builds refs/remotes path", () => {
    expect(remoteTrackingRef("origin", "hyper-pm-data")).toBe(
      "refs/remotes/origin/hyper-pm-data",
    );
  });
});

describe("mergeRefSpecifier", () => {
  it("builds remote/branch merge argument", () => {
    expect(mergeRefSpecifier("upstream", "x")).toBe("upstream/x");
  });
});

describe("isLikelyNonFastForwardPushFailure", () => {
  it("returns false for undefined", () => {
    expect(isLikelyNonFastForwardPushFailure(undefined)).toBe(false);
  });

  it("returns true when detail mentions non-fast-forward", () => {
    expect(
      isLikelyNonFastForwardPushFailure("! [rejected] non-fast-forward"),
    ).toBe(true);
  });

  it("returns true when detail mentions failed to push", () => {
    expect(isLikelyNonFastForwardPushFailure("Failed to push some refs")).toBe(
      true,
    );
  });

  it("returns false for unrelated messages", () => {
    expect(isLikelyNonFastForwardPushFailure("permission denied")).toBe(false);
  });
});

describe("classifyMergeOutput", () => {
  it("detects already up to date", () => {
    expect(classifyMergeOutput("Already up to date.\n")).toBe("up_to_date");
  });

  it("detects fast-forward", () => {
    expect(classifyMergeOutput("Fast-forward\n")).toBe("fast_forward");
  });

  it("defaults to merge_commit", () => {
    expect(classifyMergeOutput("Merge made by the 'ort' strategy.\n")).toBe(
      "merge_commit",
    );
  });
});

describe("refExists", () => {
  it("returns true when show-ref succeeds", async () => {
    const runGit: typeof runGitFn = async () => ({ stdout: "", stderr: "" });
    await expect(
      refExists("/wt", "refs/remotes/origin/hyper-pm-data", runGit),
    ).resolves.toBe(true);
  });

  it("returns false when show-ref throws", async () => {
    const runGit: typeof runGitFn = async () => {
      throw new Error("exit 1");
    };
    await expect(
      refExists("/wt", "refs/remotes/origin/missing", runGit),
    ).resolves.toBe(false);
  });
});

describe("fetchRemoteDataBranch", () => {
  it("returns skipped_no_remote when get-url fails", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") throw new Error("no remote");
      return { stdout: "", stderr: "" };
    };
    await expect(
      fetchRemoteDataBranch("/wt", "origin", "hyper-pm-data", runGit),
    ).resolves.toBe("skipped_no_remote");
  });

  it("returns ok when fetch succeeds", async () => {
    const calls: string[][] = [];
    const runGit: typeof runGitFn = async (_cwd, args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    };
    await expect(
      fetchRemoteDataBranch("/wt", "origin", "hyper-pm-data", runGit),
    ).resolves.toBe("ok");
    expect(calls).toContainEqual(["fetch", "origin", "hyper-pm-data"]);
  });

  it("returns remote_branch_absent when ref missing on remote", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "url", stderr: "" };
      if (args[0] === "fetch") {
        throw new Error("fatal: couldn't find remote ref hyper-pm-data");
      }
      return { stdout: "", stderr: "" };
    };
    await expect(
      fetchRemoteDataBranch("/wt", "origin", "hyper-pm-data", runGit),
    ).resolves.toBe("remote_branch_absent");
  });

  it("rethrows other fetch errors", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "url", stderr: "" };
      if (args[0] === "fetch") throw new Error("network exploded");
      return { stdout: "", stderr: "" };
    };
    await expect(
      fetchRemoteDataBranch("/wt", "origin", "hyper-pm-data", runGit),
    ).rejects.toThrow("network exploded");
  });
});

const isDataMerge = (args: string[]): boolean =>
  args.includes("merge") && args.includes("--no-edit");

describe("mergeRemoteTrackingIntoHead", () => {
  it("returns merge status from stdout on success", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "config") return { stdout: "n", stderr: "" };
      if (args[0] === "merge" && args.includes("--abort")) {
        return { stdout: "", stderr: "" };
      }
      if (isDataMerge(args)) {
        return { stdout: "Already up to date.\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const out = await mergeRemoteTrackingIntoHead(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      {},
    );
    expect(out).toBe("up_to_date");
  });

  it("throws merge error with conflict hint and aborts", async () => {
    const calls: string[][] = [];
    const runGit: typeof runGitFn = async (_cwd, args) => {
      calls.push(args);
      if (args[0] === "config") return { stdout: "n", stderr: "" };
      if (args[0] === "merge" && args.includes("--abort")) {
        return { stdout: "", stderr: "" };
      }
      if (isDataMerge(args)) {
        throw new Error("CONFLICT (content): Merge conflict in x");
      }
      return { stdout: "", stderr: "" };
    };
    let caught: unknown;
    try {
      await mergeRemoteTrackingIntoHead(
        "/wt",
        "origin",
        "hyper-pm-data",
        runGit,
        {},
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SyncRemoteDataBranchMergeError);
    expect(String(caught)).toMatch(/Merge conflict/);
    expect(calls.some((a) => a[0] === "merge" && a.includes("--abort"))).toBe(
      true,
    );
  });

  it("throws generic merge error when not conflict", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "config") return { stdout: "n", stderr: "" };
      if (args[0] === "merge" && args.includes("--abort")) {
        return { stdout: "", stderr: "" };
      }
      if (isDataMerge(args)) {
        throw new Error("some other merge failure");
      }
      return { stdout: "", stderr: "" };
    };
    await expect(
      mergeRemoteTrackingIntoHead("/wt", "origin", "hyper-pm-data", runGit, {}),
    ).rejects.toThrow(/git merge failed/);
  });
});

describe("runRemoteDataBranchGitSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns skipped paths when remote missing", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") throw new Error("no remote");
      return { stdout: "", stderr: "" };
    };
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
    );
    expect(out).toEqual({
      dataBranchFetch: "skipped_no_remote",
      dataBranchMerge: "skipped_no_remote",
      dataBranchPush: "skipped_no_remote",
      dataBranchPushDetail: "no remote",
      pushAttempts: 1,
    });
  });

  it("skips merge when remote branch absent and still tries push", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") {
        throw new Error("fatal: couldn't find remote ref hyper-pm-data");
      }
      if (args[0] === "push") return { stdout: "", stderr: "" };
      return { stdout: "", stderr: "" };
    };
    const tryPush: (
      w: string,
      r: string,
      b: string,
      rg: typeof runGitFn,
    ) => Promise<TryPushDataBranchResult> = vi
      .fn()
      .mockResolvedValue({ status: "pushed" });
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush },
    );
    expect(out.dataBranchFetch).toBe("remote_branch_absent");
    expect(out.dataBranchMerge).toBe("skipped_missing_remote_branch");
    expect(out.dataBranchPush).toBe("pushed");
    expect(tryPush).toHaveBeenCalledTimes(1);
  });

  it("returns skipped_cli when skipPush", async () => {
    const runGit: typeof runGitFn = async () => ({ stdout: "", stderr: "" });
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      true,
    );
    expect(out.dataBranchPush).toBe("skipped_cli");
    expect(out.pushAttempts).toBe(0);
  });

  it("merges when tracking ref exists after fetch", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "show-ref") return { stdout: "abc", stderr: "" };
      if (args[0] === "config") return { stdout: "t", stderr: "" };
      if (isDataMerge(args)) {
        return { stdout: "Fast-forward\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const tryPush = vi
      .fn()
      .mockResolvedValue({
        status: "pushed",
      } satisfies TryPushDataBranchResult);
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush },
    );
    expect(out.dataBranchMerge).toBe("fast_forward");
    expect(out.dataBranchPush).toBe("pushed");
  });

  it("skips merge when fetch ok but tracking ref missing", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "show-ref") throw new Error("missing");
      return { stdout: "", stderr: "" };
    };
    const tryPush = vi
      .fn()
      .mockResolvedValue({
        status: "pushed",
      } satisfies TryPushDataBranchResult);
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush },
    );
    expect(out.dataBranchMerge).toBe("skipped_missing_remote_branch");
  });

  it("retries push after non-fast-forward then succeeds", async () => {
    let fetchCount = 0;
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") {
        fetchCount += 1;
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "show-ref") return { stdout: "ref", stderr: "" };
      if (args[0] === "config") return { stdout: "t", stderr: "" };
      if (isDataMerge(args)) {
        return { stdout: "Already up to date.\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const tryPush = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed",
        detail: "rejected non-fast-forward",
      } satisfies TryPushDataBranchResult)
      .mockResolvedValueOnce({
        status: "pushed",
      } satisfies TryPushDataBranchResult);
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush, maxPushAttempts: 3 },
    );
    expect(out.dataBranchPush).toBe("pushed");
    expect(out.pushAttempts).toBe(2);
    expect(fetchCount).toBeGreaterThanOrEqual(2);
    expect(tryPush).toHaveBeenCalledTimes(2);
  });

  it("on retry refetch returns early when second fetch has no remote branch", async () => {
    let fetchInvocations = 0;
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") {
        fetchInvocations += 1;
        if (fetchInvocations === 2) {
          throw new Error("fatal: couldn't find remote ref hyper-pm-data");
        }
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "show-ref") return { stdout: "r", stderr: "" };
      if (args[0] === "config") return { stdout: "t", stderr: "" };
      if (isDataMerge(args)) {
        return { stdout: "Already up to date.\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const tryPush = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed",
        detail: "non-fast-forward",
      } satisfies TryPushDataBranchResult)
      .mockResolvedValueOnce({
        status: "pushed",
      } satisfies TryPushDataBranchResult);
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush, maxPushAttempts: 3 },
    );
    expect(out.dataBranchFetch).toBe("remote_branch_absent");
    expect(out.dataBranchPush).toBe("pushed");
    expect(tryPush).toHaveBeenCalledTimes(2);
  });

  it("on retry refetch returns early when tracking ref is missing after fetch", async () => {
    let showRefCalls = 0;
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "show-ref") {
        showRefCalls += 1;
        if (showRefCalls === 1) return { stdout: "r", stderr: "" };
        throw new Error("missing ref");
      }
      if (args[0] === "config") return { stdout: "t", stderr: "" };
      if (isDataMerge(args)) {
        return { stdout: "Already up to date.\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const tryPush = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed",
        detail: "non-fast-forward",
      } satisfies TryPushDataBranchResult)
      .mockResolvedValueOnce({
        status: "failed",
        detail: "still bad",
      } satisfies TryPushDataBranchResult);
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush, maxPushAttempts: 3 },
    );
    expect(out.dataBranchPush).toBe("failed");
    expect(tryPush).toHaveBeenCalledTimes(2);
  });

  it("does not retry when push failed for other reasons", async () => {
    const runGit: typeof runGitFn = async (_cwd, args) => {
      if (args[0] === "remote") return { stdout: "u", stderr: "" };
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "show-ref") return { stdout: "r", stderr: "" };
      if (args[0] === "config") return { stdout: "t", stderr: "" };
      if (isDataMerge(args)) {
        return { stdout: "Already up to date.\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const tryPush = vi.fn().mockResolvedValue({
      status: "failed",
      detail: "permission denied",
    } satisfies TryPushDataBranchResult);
    const out = await runRemoteDataBranchGitSync(
      "/wt",
      "origin",
      "hyper-pm-data",
      runGit,
      false,
      { tryPush, maxPushAttempts: 3 },
    );
    expect(out.dataBranchPush).toBe("failed");
    expect(out.pushAttempts).toBe(1);
    expect(tryPush).toHaveBeenCalledTimes(1);
  });
});
