/** @vitest-environment node */
import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describe, expect, it, vi } from "vitest";
import { mergeRunHyperPmMcpServerDeps } from "./run-mcp-server";

describe("mergeRunHyperPmMcpServerDeps", () => {
  it("uses default factories when omitted", () => {
    // Setup
    const server = { connect: vi.fn() };
    const createHyperPmMcpServerFn = vi.fn().mockReturnValue(server);
    class FakeTransport {}
    const stdioTransportCtor =
      FakeTransport as unknown as typeof StdioServerTransport;

    // Act
    const merged = mergeRunHyperPmMcpServerDeps(
      {},
      { createHyperPmMcpServerFn, stdioTransportCtor },
    );
    const s = merged.createServer();
    const t = merged.createTransport();

    // Assert
    expect(createHyperPmMcpServerFn).toHaveBeenCalledTimes(1);
    expect(s).toBe(server);
    expect(t).toBeInstanceOf(FakeTransport);
  });

  it("preserves injected factories when provided", () => {
    // Setup
    const createServer = vi.fn().mockReturnValue({ connect: vi.fn() });
    const createTransport = vi.fn().mockReturnValue({});

    // Act
    const merged = mergeRunHyperPmMcpServerDeps(
      { createServer, createTransport },
      {
        createHyperPmMcpServerFn: vi.fn(),
        stdioTransportCtor: vi.fn(),
      },
    );

    // Assert
    expect(merged.createServer).toBe(createServer);
    expect(merged.createTransport).toBe(createTransport);
  });

  it("uses production collaborators when the collabs argument is omitted", () => {
    // Act
    const merged = mergeRunHyperPmMcpServerDeps({});
    const server = merged.createServer();

    // Assert
    expect(server.registerTool).toEqual(expect.any(Function));
  });
});
