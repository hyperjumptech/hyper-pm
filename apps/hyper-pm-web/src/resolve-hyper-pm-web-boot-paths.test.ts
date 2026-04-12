/** @vitest-environment node */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveHyperPmWebRepoRoot,
  resolveHyperPmWebTempDirParent,
} from "./resolve-hyper-pm-web-boot-paths";

describe("resolveHyperPmWebRepoRoot", () => {
  it("uses getCwd when env is empty or whitespace", () => {
    // Act
    const a = resolveHyperPmWebRepoRoot(undefined, () => "/tmp/foo");
    const b = resolveHyperPmWebRepoRoot("   ", () => "/tmp/foo");

    // Assert
    expect(a).toBe(resolve("/tmp/foo"));
    expect(b).toBe(resolve("/tmp/foo"));
  });

  it("resolves a non-empty env path against getCwd", () => {
    // Act
    const r = resolveHyperPmWebRepoRoot("sub", () => "/p");

    // Assert
    expect(r).toBe(resolve("/p", "sub"));
  });
});

describe("resolveHyperPmWebTempDirParent", () => {
  const created: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const p of created.splice(0)) {
      await rm(p, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("returns resolved env path without cleanup when env is set", async () => {
    // Act
    const r = await resolveHyperPmWebTempDirParent("/explicit/tmp");

    // Assert
    expect(r.tempDirParent).toMatch(/explicit[\\/]tmp$/);
    expect(r.cleanup).toBeUndefined();
  });

  it("creates a temp directory and returns cleanup when env is unset", async () => {
    // Act
    const r = await resolveHyperPmWebTempDirParent(undefined);
    if (r.cleanup) {
      created.push(r.tempDirParent);
    }

    // Assert
    expect(r.tempDirParent).toMatch(/hyper-pm-web-wt-/);
    expect(r.cleanup).toEqual(expect.any(Function));
    await expect(r.cleanup?.()).resolves.toBeUndefined();
  });

  it("uses injected mkdtemp for tests", async () => {
    // Setup
    const mkdtempFn = vi.fn().mockResolvedValue("/fake/wt");
    const rmDir = vi.fn().mockResolvedValue(undefined);

    // Act
    const r = await resolveHyperPmWebTempDirParent(undefined, {
      tmpdir: () => "/tmp",
      mkdtemp: mkdtempFn,
      joinPaths: join,
      rmDir,
    });

    // Assert
    expect(mkdtempFn).toHaveBeenCalledWith(join("/tmp", "hyper-pm-web-wt-"));
    expect(r.tempDirParent).toBe("/fake/wt");
    await expect(r.cleanup?.()).resolves.toBeUndefined();
    expect(rmDir).toHaveBeenCalledWith("/fake/wt", {
      recursive: true,
      force: true,
    });
  });
});
