import { runHyperPmMcpServer } from "./run-mcp-server";

/**
 * CLI entry: starts the hyper-pm MCP server on stdio.
 *
 * @param deps - Injectable server bootstrap (defaults to `runHyperPmMcpServer`).
 */
export const bootstrapHyperPmMcpMain = async (
  deps: {
    runServer?: typeof runHyperPmMcpServer;
  } = {},
): Promise<void> => {
  const run = deps.runServer ?? runHyperPmMcpServer;
  await run();
};
