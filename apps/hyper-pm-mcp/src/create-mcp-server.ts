import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runHyperPmCli } from "@workspace/hyper-pm-cli-runner";
import { registerHyperPmTools } from "./register-hyper-pm-tools";

const serverVersion = "0.1.0";

/**
 * Creates a configured `McpServer` for hyper-pm (stdio-oriented tools).
 *
 * @param deps - Optional overrides for tool registration (tests inject a fake CLI runner).
 * @returns A server instance that has not yet been connected to a transport.
 */
export const createHyperPmMcpServer = (
  deps: {
    registerTools?: typeof registerHyperPmTools;
    runHyperPmCliFn?: typeof runHyperPmCli;
  } = {},
): McpServer => {
  const register = deps.registerTools ?? registerHyperPmTools;
  const runFn = deps.runHyperPmCliFn ?? runHyperPmCli;
  const server = new McpServer({
    name: "hyper-pm-mcp",
    version: serverVersion,
  });
  register(server, { runHyperPmCliFn: runFn });
  return server;
};
