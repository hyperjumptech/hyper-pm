/** @vitest-environment node */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHyperPmWebServer } from "./create-hyper-pm-web-server";

describe("createHyperPmWebServer", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("GET /api/health returns repo paths", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "<html></html>");
    await writeFile(join(base, "app.js"), "");
    const runHyperPmCliFn = vi.fn();
    const server = createHyperPmWebServer({
      repoRoot: "/repo",
      tempDirParent: "/tmp",
      publicDir: base,
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);

    // Assert
    expect(res.ok).toBe(true);
    const j = (await res.json()) as {
      ok: boolean;
      repoPath: string;
      tempDirParent: string;
    };
    expect(j.ok).toBe(true);
    expect(j.repoPath).toBe("/repo");
    expect(j.tempDirParent).toBe("/tmp");
    server.close();
  });

  it("POST /api/run forwards merged repo and temp to the runner", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "<html></html>");
    await writeFile(join(base, "app.js"), "");
    const runHyperPmCliFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "{}",
      stderr: "",
      signal: null,
    });
    const server = createHyperPmWebServer({
      repoRoot: "/r",
      tempDirParent: "/wt",
      publicDir: base,
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ argv: ["doctor"] }),
    });

    // Assert
    expect(res.ok).toBe(true);
    expect(runHyperPmCliFn).toHaveBeenCalledWith(
      expect.objectContaining({
        argv: ["doctor"],
        repo: "/r",
        tempDir: "/wt",
      }),
    );
    const body = (await res.json()) as { ok: boolean; json: unknown };
    expect(body.ok).toBe(true);
    expect(body.json).toEqual({});
    server.close();
  });

  it("returns 400 when argv tries to override repo", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "x");
    await writeFile(join(base, "app.js"), "");
    const runHyperPmCliFn = vi.fn();
    const server = createHyperPmWebServer({
      repoRoot: "/r",
      tempDirParent: "/wt",
      publicDir: base,
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ argv: ["--repo", "/evil", "doctor"] }),
    });

    // Assert
    expect(res.status).toBe(400);
    expect(runHyperPmCliFn).not.toHaveBeenCalled();
    server.close();
  });

  it("returns 401 when bearer token is required but missing", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "x");
    await writeFile(join(base, "app.js"), "");
    const runHyperPmCliFn = vi.fn();
    const server = createHyperPmWebServer({
      repoRoot: "/r",
      tempDirParent: "/wt",
      publicDir: base,
      webToken: "need-auth",
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ argv: ["doctor"] }),
    });

    // Assert
    expect(res.status).toBe(401);
    expect(runHyperPmCliFn).not.toHaveBeenCalled();
    server.close();
  });

  it("returns 401 when bearer token is wrong", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "x");
    await writeFile(join(base, "app.js"), "");
    const runHyperPmCliFn = vi.fn();
    const server = createHyperPmWebServer({
      repoRoot: "/r",
      tempDirParent: "/wt",
      publicDir: base,
      webToken: "secret-token",
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ argv: ["doctor"] }),
    });

    // Assert
    expect(res.status).toBe(401);
    expect(runHyperPmCliFn).not.toHaveBeenCalled();
    server.close();
  });

  it("accepts POST /api/run when bearer matches", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "x");
    await writeFile(join(base, "app.js"), "");
    const runHyperPmCliFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "[]",
      stderr: "",
      signal: null,
    });
    const server = createHyperPmWebServer({
      repoRoot: "/r",
      tempDirParent: "/wt",
      publicDir: base,
      webToken: "ok-token",
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ok-token",
      },
      body: JSON.stringify({ argv: ["doctor"] }),
    });

    // Assert
    expect(res.ok).toBe(true);
    expect(runHyperPmCliFn).toHaveBeenCalled();
    server.close();
  });

  it("GET /audit-event-summary.js serves the browser bundle", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hpw-test-"));
    dirs.push(base);
    await writeFile(join(base, "index.html"), "<html></html>");
    await writeFile(join(base, "app.js"), "");
    await writeFile(
      join(base, "audit-event-summary.js"),
      "window.__hpwAudit=1",
    );
    const runHyperPmCliFn = vi.fn();
    const server = createHyperPmWebServer({
      repoRoot: "/repo",
      tempDirParent: "/tmp",
      publicDir: base,
      runHyperPmCliFn,
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    // Act
    const res = await fetch(`http://127.0.0.1:${port}/audit-event-summary.js`);

    // Assert
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe("window.__hpwAudit=1");
    server.close();
  });
});
