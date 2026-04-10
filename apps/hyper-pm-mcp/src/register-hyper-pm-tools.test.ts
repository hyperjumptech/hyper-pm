/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHyperPmTools } from "./register-hyper-pm-tools";

describe("registerHyperPmTools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers hyper_pm_run and forwards input to the CLI runner", async () => {
    // Setup
    const registerTool = vi.fn();
    const runHyperPmCliFn = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "{}",
      stderr: "",
      signal: null,
    });
    const server = { registerTool } as Pick<McpServer, "registerTool">;

    // Act
    registerHyperPmTools(server, { runHyperPmCliFn });

    // Assert
    expect(registerTool).toHaveBeenCalledTimes(1);
    const firstCall = registerTool.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0]).toBe("hyper_pm_run");
    const handler = firstCall![2] as (input: {
      argv: string[];
    }) => Promise<{ content: { type: string; text: string }[] }>;
    const out = await handler({ argv: ["doctor"] });
    expect(runHyperPmCliFn).toHaveBeenCalledWith({ argv: ["doctor"] });
    const firstContent = out.content[0];
    expect(firstContent).toBeDefined();
    expect(firstContent!.type).toBe("text");
    expect(JSON.parse(firstContent!.text) as { exitCode: number }).toEqual(
      expect.objectContaining({ exitCode: 0, parsedStdout: {} }),
    );
  });
});
