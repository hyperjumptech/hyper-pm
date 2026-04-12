/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { normalizeRawCliArgv } from "./normalize-raw-cli-argv";

describe("normalizeRawCliArgv", () => {
  it("replaces legacy --no-github with --skip-network", () => {
    // Act
    const out = normalizeRawCliArgv([
      "node",
      "hyper-pm",
      "sync",
      "--no-github",
    ]);

    // Assert
    expect(out).toEqual(["node", "hyper-pm", "sync", "--skip-network"]);
  });

  it("leaves argv unchanged when flag absent", () => {
    // Setup
    const input = ["node", "hyper-pm", "doctor"];

    // Act
    const out = normalizeRawCliArgv(input);

    // Assert
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
});
