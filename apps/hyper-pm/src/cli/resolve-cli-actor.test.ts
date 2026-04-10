/** @vitest-environment node */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { runGit as runGitFn } from "../git/run-git";
import { resolveCliActor } from "./resolve-cli-actor";

describe("resolveCliActor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses trimmed cliActor when set", async () => {
    // Setup
    const runGit = vi.fn() as unknown as typeof runGitFn;
    const userInfo = vi.fn();

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/r", cliActor: "  custom-bot  ", envActor: "ignored" },
      { runGit, userInfo },
    );

    // Assert
    expect(out).toBe("custom-bot");
    expect(runGit).not.toHaveBeenCalled();
    expect(userInfo).not.toHaveBeenCalled();
  });

  it("uses envActor when cliActor is absent", async () => {
    // Setup
    const runGit = vi.fn() as unknown as typeof runGitFn;

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/r", envActor: "from-env" },
      {
        runGit,
        userInfo: () => ({
          username: "u",
          uid: 1,
          gid: 1,
          homedir: "/",
          shell: "",
        }),
      },
    );

    // Assert
    expect(out).toBe("from-env");
    expect(runGit).not.toHaveBeenCalled();
  });

  it("formats git name and email when both are set", async () => {
    // Setup
    const runGit = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[0] === "config" && args[1] === "user.name") {
        return { stdout: "Alice", stderr: "" };
      }
      if (args[0] === "config" && args[1] === "user.email") {
        return { stdout: "a@example.com", stderr: "" };
      }
      throw new Error("unexpected args");
    }) as unknown as typeof runGitFn;

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/repo" },
      {
        runGit,
        userInfo: () => ({
          username: "u",
          uid: 1,
          gid: 1,
          homedir: "/",
          shell: "",
        }),
      },
    );

    // Assert
    expect(out).toBe("cli:Alice <a@example.com>");
  });

  it("uses only git name when email is empty", async () => {
    // Setup
    const runGit = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[1] === "user.name") return { stdout: "Bob", stderr: "" };
      return { stdout: "", stderr: "" };
    }) as unknown as typeof runGitFn;

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/repo" },
      {
        runGit,
        userInfo: () => ({
          username: "fallback",
          uid: 1,
          gid: 1,
          homedir: "/",
          shell: "",
        }),
      },
    );

    // Assert
    expect(out).toBe("cli:Bob");
  });

  it("uses only git email when name is empty", async () => {
    // Setup
    const runGit = vi.fn(async (_cwd: string, args: string[]) => {
      if (args[1] === "user.email")
        return { stdout: "only@mail.test", stderr: "" };
      return { stdout: "", stderr: "" };
    }) as unknown as typeof runGitFn;

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/repo" },
      {
        runGit,
        userInfo: () => ({
          username: "fallback",
          uid: 1,
          gid: 1,
          homedir: "/",
          shell: "",
        }),
      },
    );

    // Assert
    expect(out).toBe("cli:only@mail.test");
  });

  it("falls back to local username when git config fails", async () => {
    // Setup
    const runGit = vi.fn(async () => {
      throw new Error("git missing");
    }) as unknown as typeof runGitFn;

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/repo" },
      {
        runGit,
        userInfo: () => ({
          username: "sysuser",
          uid: 1,
          gid: 1,
          homedir: "/",
          shell: "",
        }),
      },
    );

    // Assert
    expect(out).toBe("local:sysuser");
  });

  it("falls back to local username when git returns no name or email", async () => {
    // Setup
    const runGit = vi.fn(async () => ({
      stdout: "",
      stderr: "",
    })) as unknown as typeof runGitFn;

    // Act
    const out = await resolveCliActor(
      { repoRoot: "/repo" },
      {
        runGit,
        userInfo: () => ({
          username: "nobody",
          uid: 1,
          gid: 1,
          homedir: "/",
          shell: "",
        }),
      },
    );

    // Assert
    expect(out).toBe("local:nobody");
  });
});
