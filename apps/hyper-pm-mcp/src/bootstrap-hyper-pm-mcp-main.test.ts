/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapHyperPmMcpMain } from "./bootstrap-hyper-pm-mcp-main";

describe("bootstrapHyperPmMcpMain", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("awaits the default MCP server runner", async () => {
    // Setup
    const runServer = vi.fn().mockResolvedValue(undefined);

    // Act
    await bootstrapHyperPmMcpMain({ runServer });

    // Assert
    expect(runServer).toHaveBeenCalledTimes(1);
  });
});
