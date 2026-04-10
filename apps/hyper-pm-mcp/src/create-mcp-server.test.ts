/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHyperPmMcpServer } from "./create-mcp-server";

describe("createHyperPmMcpServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes registerTools with a new server instance", () => {
    // Setup
    const registerTools = vi.fn();

    // Act
    createHyperPmMcpServer({ registerTools });

    // Assert
    expect(registerTools).toHaveBeenCalledTimes(1);
    const firstCall = registerTools.mock.calls[0];
    expect(firstCall).toBeDefined();
    const serverArg = firstCall![0] as {
      registerTool: typeof vi.fn;
    };
    expect(serverArg).toEqual(
      expect.objectContaining({ registerTool: expect.any(Function) }),
    );
  });

  it("returns a server with registerTool when using built-in registration", () => {
    // Act
    const server = createHyperPmMcpServer();

    // Assert
    expect(server.registerTool).toEqual(expect.any(Function));
  });
});
