import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHyperPmMcpServer } from "./create-mcp-server";

/** Injectable factories used by `runHyperPmMcpServer`. */
export type RunHyperPmMcpServerDeps = {
  createServer?: () => McpServer;
  createTransport?: () => StdioServerTransport;
};

/** Collaborators for `mergeRunHyperPmMcpServerDeps` (injectable in tests). */
export type MergeRunHyperPmMcpServerCollabs = {
  createHyperPmMcpServerFn: typeof createHyperPmMcpServer;
  stdioTransportCtor: typeof StdioServerTransport;
};

const defaultMergeCollabs: MergeRunHyperPmMcpServerCollabs = {
  createHyperPmMcpServerFn: createHyperPmMcpServer,
  stdioTransportCtor: StdioServerTransport,
};

/**
 * Fills in default MCP server and stdio transport factories.
 *
 * @param deps - Partial overrides from the host or tests.
 * @param collabs - Server constructor and stdio transport (production defaults when omitted).
 * @returns Resolved factories (both keys always present).
 */
export const mergeRunHyperPmMcpServerDeps = (
  deps: RunHyperPmMcpServerDeps,
  collabs: MergeRunHyperPmMcpServerCollabs = defaultMergeCollabs,
): {
  createServer: () => McpServer;
  createTransport: () => StdioServerTransport;
} => ({
  createServer: deps.createServer ?? (() => collabs.createHyperPmMcpServerFn()),
  createTransport:
    deps.createTransport ?? (() => new collabs.stdioTransportCtor()),
});

/**
 * Connects the hyper-pm MCP server to stdio (for Cursor, Claude Desktop, and similar hosts).
 *
 * @param deps - Injectable server factory and transport (defaults for production).
 * @param collabs - Merge collaborators (defaults match production).
 * @returns Promise that settles when the transport is connected (remains open until the host closes it).
 */
export const runHyperPmMcpServer = async (
  deps: RunHyperPmMcpServerDeps = {},
  collabs: MergeRunHyperPmMcpServerCollabs = defaultMergeCollabs,
): Promise<void> => {
  const { createServer, createTransport } = mergeRunHyperPmMcpServerDeps(
    deps,
    collabs,
  );
  await createServer().connect(createTransport());
};
