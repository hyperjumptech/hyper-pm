import type { RunHyperPmCliResult } from "./run-hyper-pm-cli-types";
import { tryParseStdoutJson } from "./try-parse-stdout-json";

/**
 * Serializes hyper-pm CLI output into pretty-printed JSON for MCP `text` content (exit code, streams, parsed stdout when JSON).
 *
 * @param result - Aggregated child process outcome.
 * @returns JSON string suitable for `content: [{ type: "text", text }]`.
 */
export const formatHyperPmRunMcpText = (
  result: RunHyperPmCliResult,
): string => {
  const envelope = {
    exitCode: result.exitCode,
    signal: result.signal,
    stderr: result.stderr,
    stdout: result.stdout,
    parsedStdout: tryParseStdoutJson(result.stdout),
  };
  return JSON.stringify(envelope, null, 2);
};
