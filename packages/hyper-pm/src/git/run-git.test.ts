/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { runGit } from "./run-git";

describe("runGit", () => {
  it("invokes git with cwd and args", async () => {
    const execFileFn = vi.fn().mockResolvedValue({
      stdout: " ok \n",
      stderr: "",
    });

    const out = await runGit("/repo", ["status", "-sb"], { execFileFn });

    expect(execFileFn).toHaveBeenCalledWith("git", ["status", "-sb"], {
      cwd: "/repo",
    });
    expect(out.stdout).toBe("ok");
    expect(out.stderr).toBe("");
  });
});
