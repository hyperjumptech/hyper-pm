/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runHyperPmMcpServer } from "./run-mcp-server";

describe("runHyperPmMcpServer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects the server to the stdio transport", async () => {
    // Setup
    const connect = vi.fn().mockResolvedValue(undefined);
    const server = { connect } as unknown as McpServer;
    const transport = {} as StdioServerTransport;

    // Act
    await runHyperPmMcpServer({
      createServer: () => server,
      createTransport: () => transport,
    });

    // Assert
    expect(connect).toHaveBeenCalledWith(transport);
  });
});
