/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { runGit as runGitFn } from "../git/run-git";
import {
  commitDataWorktreeIfNeeded,
  formatDataBranchCommitMessage,
} from "./commit-data";

describe("commitDataWorktreeIfNeeded", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when the worktree is clean", async () => {
    // Setup
    const runGit: typeof runGitFn = vi.fn(async () => ({
      stdout: "",
      stderr: "",
    }));

    // Act
    await commitDataWorktreeIfNeeded("/wt", "msg", runGit, {
      authorEnv: {},
    });

    // Assert
    expect(runGit).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runGit).mock.calls[0]?.[1]).toEqual([
      "status",
      "--porcelain",
    ]);
  });

  it("runs add then commit with -c user.name and user.email", async () => {
    // Setup
    const runGit: typeof runGitFn = vi.fn(async (_cwd, args) => {
      if (args[0] === "status") {
        return { stdout: " M events/1.jsonl\n", stderr: "" };
      }
      if (args[0] === "add") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "config") {
        throw new Error("unset");
      }
      if (args[0] === "-c") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected: ${args.join(" ")}`);
    });

    // Act
    await commitDataWorktreeIfNeeded("/wt", "hyper-pm: sync", runGit, {
      authorEnv: {},
    });

    // Assert
    const last = vi.mocked(runGit).mock.calls.at(-1)?.[1] as string[];
    expect(last?.[0]).toBe("-c");
    expect(last?.[1]).toBe("user.name=hyper-pm");
    expect(last?.[2]).toBe("-c");
    expect(last?.[3]).toBe("user.email=hyper-pm@users.noreply.github.com");
    expect(last?.[4]).toBe("commit");
    expect(last?.[5]).toBe("-m");
    expect(last?.[6]).toBe("hyper-pm: sync");
  });
});

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
