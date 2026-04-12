/** @vitest-environment node */
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runHyperPmCli } from "./run-hyper-pm-cli";

describe("runHyperPmCli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates stdout and stderr and resolves on close", async () => {
    // Setup
    const child = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    child.stdout = stdout;
    child.stderr = stderr;
    const spawnProcess = vi.fn().mockReturnValue(child);
    stdout.end("out");
    stderr.end("err");
    setImmediate(() => {
      child.emit("close", 0, null);
    });

    // Act
    const r = await runHyperPmCli(
      { argv: ["doctor"] },
      {
        resolveMainPath: () => "/cli/main.cjs",
        execPath: "/bin/node",
        spawnProcess,
        defaultCwd: () => "/cwd",
      },
    );

    // Assert
    expect(spawnProcess).toHaveBeenCalledWith(
      "/bin/node",
      ["/cli/main.cjs", "--format", "json", "doctor"],
      { cwd: "/cwd", windowsHide: true },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("out");
    expect(r.stderr).toBe("err");
    expect(r.signal).toBeNull();
  });

  it("uses input cwd when provided", async () => {
    // Setup
    const child = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    child.stdout = stdout;
    child.stderr = stderr;
    const spawnProcess = vi.fn().mockReturnValue(child);
    stdout.end();
    stderr.end();
    setImmediate(() => child.emit("close", 0, null));

    // Act
    await runHyperPmCli(
      { argv: ["audit"], cwd: "/other" },
      {
        resolveMainPath: () => "/m.cjs",
        execPath: "/node",
        spawnProcess,
        defaultCwd: () => "/ignored",
      },
    );

    // Assert
    expect(spawnProcess).toHaveBeenCalledWith("/node", expect.any(Array), {
      cwd: "/other",
      windowsHide: true,
    });
  });

  it("rejects when spawn emits error", async () => {
    // Setup
    const child = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    child.stdout = stdout;
    child.stderr = stderr;
    const spawnProcess = vi.fn().mockReturnValue(child);
    setImmediate(() => child.emit("error", new Error("spawn failed")));

    // Act & Assert
    await expect(
      runHyperPmCli(
        { argv: ["doctor"] },
        {
          resolveMainPath: () => "/m.cjs",
          execPath: "/node",
          spawnProcess,
          defaultCwd: () => "/cwd",
        },
      ),
    ).rejects.toThrow("spawn failed");
  });

  it("preserves null exit code and signal when process exits via signal", async () => {
    // Setup
    const child = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    child.stdout = stdout;
    child.stderr = stderr;
    const spawnProcess = vi.fn().mockReturnValue(child);
    stdout.end();
    stderr.end();
    setImmediate(() => child.emit("close", null, "SIGTERM"));

    // Act
    const r = await runHyperPmCli(
      { argv: ["sync"] },
      {
        resolveMainPath: () => "/m.cjs",
        execPath: "/node",
        spawnProcess,
        defaultCwd: () => "/cwd",
      },
    );

    // Assert
    expect(r.exitCode).toBeNull();
    expect(r.signal).toBe("SIGTERM");
  });

  it("uses built-in path resolution and spawn when deps are omitted", async () => {
    // Act
    const r = await runHyperPmCli({ argv: ["--help"] });

    // Assert
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage:");
  });

  it("treats missing stdout and stderr as empty strings", async () => {
    // Setup
    const child = new EventEmitter() as ChildProcess;
    const spawnProcess = vi.fn().mockReturnValue(child);
    setImmediate(() => child.emit("close", 0, null));

    // Act
    const r = await runHyperPmCli(
      { argv: ["doctor"] },
      {
        resolveMainPath: () => "/m.cjs",
        execPath: "/node",
        spawnProcess,
        defaultCwd: () => "/cwd",
      },
    );

    // Assert
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });
});
