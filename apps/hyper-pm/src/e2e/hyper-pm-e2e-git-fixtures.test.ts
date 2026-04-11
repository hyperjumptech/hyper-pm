/** @vitest-environment node */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGitRepoWithInitialCommit,
  git,
  sleep,
} from "./hyper-pm-e2e-git-fixtures";

describe("hyper-pm-e2e-git-fixtures sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the delay", async () => {
    // Act
    const pending = sleep(5000);
    await vi.advanceTimersByTimeAsync(5000);

    // Assert
    await expect(pending).resolves.toBeUndefined();
  });
});

describe("hyper-pm-e2e-git-fixtures createGitRepoWithInitialCommit", () => {
  let base: string;

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(base, { recursive: true, force: true });
  });

  it("creates a repo with an initial commit and supports git()", async () => {
    // Setup
    base = await mkdtemp(join(tmpdir(), "git-fixtures-"));

    // Act
    const root = await createGitRepoWithInitialCommit(base);
    const log = await git(root, ["log", "-1", "--oneline"]);

    // Assert
    expect(log).toMatch(/init/);
  });
});
