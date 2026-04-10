import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveGithubTokenForSync } from "./resolve-github-token-for-sync";

describe("resolveGithubTokenForSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trimmed env token without invoking gh", async () => {
    // Setup
    const execFileFn = vi.fn().mockRejectedValue(new Error("should not run"));

    // Act
    const out = await resolveGithubTokenForSync({
      envToken: "  pat123 ",
      cwd: "/repo",
      execFileFn,
    });

    // Assert
    expect(out).toBe("pat123");
    expect(execFileFn).not.toHaveBeenCalled();
  });

  it("falls back to gh when env token is undefined", async () => {
    // Setup
    const execFileFn = vi.fn().mockResolvedValue({
      stdout: "gh-token\n",
      stderr: "",
    });

    // Act
    const out = await resolveGithubTokenForSync({
      envToken: undefined,
      cwd: "/repo",
      execFileFn,
    });

    // Assert
    expect(out).toBe("gh-token");
    expect(execFileFn).toHaveBeenCalledWith("gh", ["auth", "token"], {
      cwd: "/repo",
    });
  });

  it("falls back to gh when env token is empty or whitespace only", async () => {
    // Setup
    const execFileFn = vi.fn().mockResolvedValue({
      stdout: "tok",
      stderr: "",
    });

    // Act
    const empty = await resolveGithubTokenForSync({
      envToken: "",
      cwd: "/r",
      execFileFn,
    });
    const whitespace = await resolveGithubTokenForSync({
      envToken: "   \n\t  ",
      cwd: "/r",
      execFileFn,
    });

    // Assert
    expect(empty).toBe("tok");
    expect(whitespace).toBe("tok");
    expect(execFileFn).toHaveBeenCalledTimes(2);
  });

  it("returns null when gh rejects", async () => {
    // Setup
    const execFileFn = vi.fn().mockRejectedValue(new Error("not logged in"));

    // Act
    const out = await resolveGithubTokenForSync({
      envToken: undefined,
      cwd: "/r",
      execFileFn,
    });

    // Assert
    expect(out).toBeNull();
  });

  it("returns null when gh stdout is empty after trim", async () => {
    // Setup
    const execFileFn = vi.fn().mockResolvedValue({
      stdout: "  \n  ",
      stderr: "",
    });

    // Act
    const out = await resolveGithubTokenForSync({
      envToken: undefined,
      cwd: "/r",
      execFileFn,
    });

    // Assert
    expect(out).toBeNull();
  });

  it("normalizes Buffer stdout from gh", async () => {
    // Setup
    const execFileFn = vi.fn().mockResolvedValue({
      stdout: Buffer.from("buf-tok\n"),
      stderr: "",
    });

    // Act
    const out = await resolveGithubTokenForSync({
      envToken: undefined,
      cwd: "/r",
      execFileFn,
    });

    // Assert
    expect(out).toBe("buf-tok");
  });
});
