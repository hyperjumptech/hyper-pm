/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { runGit as runGitFn } from "./run-git";
import { resolveEffectiveGitAuthorForDataCommit } from "./resolve-effective-git-author-for-data-commit";

describe("resolveEffectiveGitAuthorForDataCommit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers git config over env and defaults", async () => {
    // Setup
    const runGit: typeof runGitFn = vi.fn(async (_cwd, args) => {
      if (args[0] === "config" && args[2] === "user.name") {
        return { stdout: "From Git", stderr: "" };
      }
      if (args[0] === "config" && args[2] === "user.email") {
        return { stdout: "git@example.com", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    // Act
    const out = await resolveEffectiveGitAuthorForDataCommit("/wt", runGit, {
      HYPER_PM_GIT_USER_NAME: "Env Name",
      HYPER_PM_GIT_USER_EMAIL: "env@example.com",
    });

    // Assert
    expect(out).toEqual({ name: "From Git", email: "git@example.com" });
  });

  it("uses HYPER_PM_GIT_* when git config is missing", async () => {
    // Setup
    const runGit: typeof runGitFn = vi.fn(async (_cwd, args) => {
      if (args[0] === "config") {
        throw new Error("not set");
      }
      return { stdout: "", stderr: "" };
    });

    // Act
    const out = await resolveEffectiveGitAuthorForDataCommit("/wt", runGit, {
      HYPER_PM_GIT_USER_NAME: "PM User",
      HYPER_PM_GIT_USER_EMAIL: "pm@example.com",
    });

    // Assert
    expect(out).toEqual({ name: "PM User", email: "pm@example.com" });
  });

  it("falls back to GIT_AUTHOR_* then defaults", async () => {
    // Setup
    const runGit: typeof runGitFn = vi.fn(async () => {
      throw new Error("not set");
    });

    // Act
    const out = await resolveEffectiveGitAuthorForDataCommit("/wt", runGit, {
      GIT_AUTHOR_NAME: "Author",
      GIT_AUTHOR_EMAIL: "author@example.com",
    });

    // Assert
    expect(out).toEqual({ name: "Author", email: "author@example.com" });
  });

  it("uses built-in defaults when nothing else is set", async () => {
    // Setup
    const runGit: typeof runGitFn = vi.fn(async () => {
      throw new Error("not set");
    });

    // Act
    const out = await resolveEffectiveGitAuthorForDataCommit("/wt", runGit, {});

    // Assert
    expect(out).toEqual({
      name: "hyper-pm",
      email: "hyper-pm@users.noreply.github.com",
    });
  });
});
