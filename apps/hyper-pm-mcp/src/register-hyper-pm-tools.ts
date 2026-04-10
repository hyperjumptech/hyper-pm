import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatHyperPmRunMcpText } from "./format-hyper-pm-run-mcp-text";
import { hyperPmRunInputSchema } from "./hyper-pm-run-input-schema";
import { runHyperPmCli } from "./run-hyper-pm-cli";

/**
 * Registers hyper-pm MCP tools on the given server instance.
 *
 * @param server - MCP server (`registerTool` only required for tests).
 * @param deps - Injectable CLI runner (defaults to the real `runHyperPmCli`).
 */
export const registerHyperPmTools = (
  server: Pick<McpServer, "registerTool">,
  deps: {
    runHyperPmCliFn: typeof runHyperPmCli;
  } = {
    runHyperPmCliFn: runHyperPmCli,
  },
): void => {
  server.registerTool(
    "hyper_pm_run",
    {
      description:
        "Runs the hyper-pm CLI with JSON output (`--format json` is injected). Equivalent to running hyper-pm locally with the same flags; only use in trusted setups.",
      inputSchema: hyperPmRunInputSchema,
    },
    async (input) => {
      const result = await deps.runHyperPmCliFn(input);
      return {
        content: [{ type: "text", text: formatHyperPmRunMcpText(result) }],
      };
    },
  );
};
