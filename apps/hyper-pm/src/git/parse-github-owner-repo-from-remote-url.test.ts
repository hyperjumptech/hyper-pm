/** @vitest-environment node */
import { describe, expect, it } from "vitest";

import { parseGithubOwnerRepoFromRemoteUrl } from "./parse-github-owner-repo-from-remote-url";

describe("parseGithubOwnerRepoFromRemoteUrl", () => {
  it("returns undefined for blank input", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl("  \n  ");

    // Assert
    expect(out).toBeUndefined();
  });

  it("parses git@github.com scp-style URLs", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl(
      "git@github.com:hyperjump/hyper-pm.git",
    );

    // Assert
    expect(out).toBe("hyperjump/hyper-pm");
  });

  it("parses HTTPS github.com URLs with credentials", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl(
      "https://oauth2:secret@github.com/acme/widget.git\n",
    );

    // Assert
    expect(out).toBe("acme/widget");
  });

  it("accepts www.github.com host", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl(
      "https://www.github.com/org/repo",
    );

    // Assert
    expect(out).toBe("org/repo");
  });

  it("parses ssh://git@github.com/ URLs", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl(
      "ssh://git@github.com/myorg/myrepo.git",
    );

    // Assert
    expect(out).toBe("myorg/myrepo");
  });

  it("returns undefined for non-GitHub hosts", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl(
      "https://git.example.com/group/project.git",
    );

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns undefined when the GitHub path has fewer than two segments", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl("https://github.com/lone");

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns undefined for scp-style URLs with a single path segment", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl("git@github.com:onlyone");

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns undefined for URLs that cannot be parsed", () => {
    // Act
    const out = parseGithubOwnerRepoFromRemoteUrl("https://[:::");

    // Assert
    expect(out).toBeUndefined();
  });
});
