/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertGitRefResolvable,
  resolveIntegrationStartPoint,
} from "./resolve-integration-start-point";
import type { RunGitLike } from "./resolve-integration-start-point";

describe("assertGitRefResolvable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves when rev-parse succeeds", async () => {
    // Setup
    const git = vi.fn(async () => ({
      stdout: "abc",
      stderr: "",
    })) as unknown as RunGitLike;

    // Act
    await assertGitRefResolvable("/repo", "main", git);

    // Assert
    expect(git).toHaveBeenCalledWith("/repo", [
      "rev-parse",
      "-q",
      "--verify",
      "main",
    ]);
  });

  it("throws when rev-parse fails", async () => {
    // Setup
    const git = vi.fn(async () => {
      throw new Error("bad ref");
    }) as unknown as RunGitLike;

    // Act & Assert
    await expect(assertGitRefResolvable("/repo", "nope", git)).rejects.toThrow(
      "Invalid or ambiguous --from ref: nope",
    );
  });
});

describe("resolveIntegrationStartPoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns remote HEAD target when symbolic-ref and verify succeed", async () => {
    // Setup
    const git = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "symbolic-ref") {
        return { stdout: "refs/remotes/origin/main", stderr: "" };
      }
      if (args[0] === "rev-parse") {
        return { stdout: "deadbeef", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    }) as unknown as RunGitLike;

    // Act
    const ref = await resolveIntegrationStartPoint("/repo", "origin", git);

    // Assert
    expect(ref).toBe("refs/remotes/origin/main");
    expect(git).toHaveBeenCalledWith("/repo", [
      "symbolic-ref",
      "-q",
      "refs/remotes/origin/HEAD",
    ]);
  });

  it("falls back to refs/heads/main when remote HEAD fails", async () => {
    // Setup
    const git = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "symbolic-ref") {
        throw new Error("no symref");
      }
      if (args[0] === "rev-parse" && args[3] === "refs/heads/main") {
        return { stdout: "abc", stderr: "" };
      }
      throw new Error("missing");
    }) as unknown as RunGitLike;

    // Act
    const ref = await resolveIntegrationStartPoint("/repo", "origin", git);

    // Assert
    expect(ref).toBe("refs/heads/main");
  });

  it("falls back to refs/heads/master when main is missing", async () => {
    // Setup
    const git = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "symbolic-ref") {
        throw new Error("no symref");
      }
      if (args[0] === "rev-parse" && args[3] === "refs/heads/main") {
        throw new Error("no main");
      }
      if (args[0] === "rev-parse" && args[3] === "refs/heads/master") {
        return { stdout: "abc", stderr: "" };
      }
      throw new Error("missing");
    }) as unknown as RunGitLike;

    // Act
    const ref = await resolveIntegrationStartPoint("/repo", "origin", git);

    // Assert
    expect(ref).toBe("refs/heads/master");
  });

  it("falls back to HEAD when no named branches resolve", async () => {
    // Setup
    const git = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "symbolic-ref") {
        throw new Error("no symref");
      }
      if (args[0] === "rev-parse" && args[3] === "refs/heads/main") {
        throw new Error("no main");
      }
      if (args[0] === "rev-parse" && args[3] === "refs/heads/master") {
        throw new Error("no master");
      }
      if (args[0] === "rev-parse" && args[3] === "HEAD") {
        return { stdout: "deadbeef", stderr: "" };
      }
      throw new Error("missing");
    }) as unknown as RunGitLike;

    // Act
    const ref = await resolveIntegrationStartPoint("/repo", "origin", git);

    // Assert
    expect(ref).toBe("HEAD");
  });

  it("throws when nothing resolves", async () => {
    // Setup
    const git = vi.fn(async () => {
      throw new Error("fail");
    }) as unknown as RunGitLike;

    // Act & Assert
    await expect(
      resolveIntegrationStartPoint("/repo", "origin", git),
    ).rejects.toThrow("pass --from");
  });
});
