/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import type { HyperPmConfig } from "../config/hyper-pm-config";
import { resolveGithubRepo } from "./run-github-sync";

const baseConfig = {
  schema: 1,
  dataBranch: "hyper-pm-data",
  remote: "origin",
  sync: "full",
  issueMapping: "ticket",
} as const satisfies Omit<HyperPmConfig, "githubRepo">;

describe("resolveGithubRepo", () => {
  it("prefers config.githubRepo over env and git-derived slug", () => {
    // Setup
    const config: HyperPmConfig = {
      ...baseConfig,
      githubRepo: "cfg/cfg",
    };

    // Act
    const out = resolveGithubRepo(config, "env/env", "git/git");

    // Assert
    expect(out).toEqual({ owner: "cfg", repo: "cfg" });
  });

  it("falls back to GITHUB_REPO when config omits githubRepo", () => {
    // Setup
    const config: HyperPmConfig = { ...baseConfig };

    // Act
    const out = resolveGithubRepo(config, "env/env", "git/git");

    // Assert
    expect(out).toEqual({ owner: "env", repo: "env" });
  });

  it("falls back to git-derived slug when config and env omit githubRepo", () => {
    // Setup
    const config: HyperPmConfig = { ...baseConfig };

    // Act
    const out = resolveGithubRepo(config, undefined, "solo/repo");

    // Assert
    expect(out).toEqual({ owner: "solo", repo: "repo" });
  });

  it("strips a trailing .git segment from the repo name", () => {
    // Setup
    const config: HyperPmConfig = {
      ...baseConfig,
      githubRepo: "o/r.git",
    };

    // Act
    const out = resolveGithubRepo(config, undefined, undefined);

    // Assert
    expect(out).toEqual({ owner: "o", repo: "r" });
  });

  it("throws when no slug is available", () => {
    // Setup
    const config: HyperPmConfig = { ...baseConfig };

    // Act
    const act = () => resolveGithubRepo(config, undefined, undefined);

    // Assert
    expect(act).toThrow(/githubRepo missing/);
  });

  it("throws when githubRepo is invalid", () => {
    // Setup
    const config: HyperPmConfig = {
      ...baseConfig,
      githubRepo: "nope",
    };

    // Act
    const act = () => resolveGithubRepo(config, undefined, undefined);

    // Assert
    expect(act).toThrow(/Invalid githubRepo/);
  });
});
