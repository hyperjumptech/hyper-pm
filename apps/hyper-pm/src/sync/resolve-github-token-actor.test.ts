/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Octokit } from "@octokit/rest";
import { resolveGithubTokenActor } from "./resolve-github-token-actor";

describe("resolveGithubTokenActor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns github:login when getAuthenticated succeeds", async () => {
    // Setup
    const octokit = {} as Octokit;
    const getAuthenticated = vi.fn().mockResolvedValue({
      data: { login: "octocat" },
    });

    // Act
    const out = await resolveGithubTokenActor(octokit, { getAuthenticated });

    // Assert
    expect(out).toBe("github:octocat");
    expect(getAuthenticated).toHaveBeenCalledOnce();
  });

  it("trims login", async () => {
    // Setup
    const octokit = {} as Octokit;

    // Act
    const out = await resolveGithubTokenActor(octokit, {
      getAuthenticated: async () => ({ data: { login: "  u  " } }),
    });

    // Assert
    expect(out).toBe("github:u");
  });

  it("returns github-sync when login is missing", async () => {
    // Setup
    const octokit = {} as Octokit;

    // Act
    const out = await resolveGithubTokenActor(octokit, {
      getAuthenticated: async () => ({ data: { login: null } }),
    });

    // Assert
    expect(out).toBe("github-sync");
  });

  it("returns github-sync when getAuthenticated throws", async () => {
    // Setup
    const octokit = {} as Octokit;

    // Act
    const out = await resolveGithubTokenActor(octokit, {
      getAuthenticated: async () => {
        throw new Error("403");
      },
    });

    // Assert
    expect(out).toBe("github-sync");
  });
});
