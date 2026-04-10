/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { formatHyperPmRunMcpText } from "./format-hyper-pm-run-mcp-text";

describe("formatHyperPmRunMcpText", () => {
  it("serializes exit metadata, streams, and parsed JSON stdout", () => {
    // Setup
    const result = {
      exitCode: 0,
      stdout: '{"ok":true}\n',
      stderr: "",
      signal: null,
    };

    // Act
    const text = formatHyperPmRunMcpText(result);
    const parsed = JSON.parse(text) as {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      signal: string | null;
      parsedStdout: unknown;
    };

    // Assert
    expect(parsed.exitCode).toBe(0);
    expect(parsed.signal).toBeNull();
    expect(parsed.stderr).toBe("");
    expect(parsed.stdout).toBe('{"ok":true}\n');
    expect(parsed.parsedStdout).toEqual({ ok: true });
  });

  it("sets parsedStdout to null when stdout is not JSON", () => {
    // Act
    const text = formatHyperPmRunMcpText({
      exitCode: 1,
      stdout: "plain",
      stderr: "err",
      signal: null,
    });
    const parsed = JSON.parse(text) as { parsedStdout: unknown };

    // Assert
    expect(parsed.parsedStdout).toBeNull();
  });
});
