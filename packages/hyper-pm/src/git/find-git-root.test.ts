/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { findGitRoot } from "./find-git-root";

describe("findGitRoot", () => {
  it("returns trimmed root from rev-parse", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValue({ stdout: "/tmp/repo", stderr: "" });

    await expect(findGitRoot("/tmp/repo/sub", { runGit })).resolves.toBe(
      "/tmp/repo",
    );
    expect(runGit).toHaveBeenCalledWith("/tmp/repo/sub", [
      "rev-parse",
      "--show-toplevel",
    ]);
  });
});
