/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { buildHyperPmCliArgv } from "./build-hyper-pm-cli-argv";

describe("buildHyperPmCliArgv", () => {
  it("prepends format json and appends subcommand argv", () => {
    // Act
    const args = buildHyperPmCliArgv({ argv: ["doctor"] });

    // Assert
    expect(args).toEqual(["--format", "json", "doctor"]);
  });

  it("inserts optional global flags before subcommand argv", () => {
    // Act
    const args = buildHyperPmCliArgv({
      argv: ["epic", "read", "--id", "e1"],
      repo: "/repo",
      tempDir: "/tmp",
      actor: "alice",
      githubRepo: "o/r",
      dataBranch: "hyper-pm-data",
      remote: "origin",
      sync: "full",
      keepWorktree: true,
    });

    // Assert
    expect(args).toEqual([
      "--format",
      "json",
      "--repo",
      "/repo",
      "--temp-dir",
      "/tmp",
      "--actor",
      "alice",
      "--github-repo",
      "o/r",
      "--data-branch",
      "hyper-pm-data",
      "--remote",
      "origin",
      "--sync",
      "full",
      "--keep-worktree",
      "epic",
      "read",
      "--id",
      "e1",
    ]);
  });

  it("omits keep-worktree when false or undefined", () => {
    // Act
    const without = buildHyperPmCliArgv({
      argv: ["audit"],
      keepWorktree: false,
    });
    const implicit = buildHyperPmCliArgv({ argv: ["audit"] });

    // Assert
    expect(without).toEqual(["--format", "json", "audit"]);
    expect(implicit).toEqual(["--format", "json", "audit"]);
  });
});
