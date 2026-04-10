/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { tryParseStdoutJson } from "./try-parse-stdout-json";

describe("tryParseStdoutJson", () => {
  it("returns null for empty or whitespace-only stdout", () => {
    // Act
    const a = tryParseStdoutJson("");
    const b = tryParseStdoutJson("   \n ");

    // Assert
    expect(a).toBeNull();
    expect(b).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    // Act
    const r = tryParseStdoutJson("{ not json");

    // Assert
    expect(r).toBeNull();
  });

  it("parses trimmed JSON objects and arrays", () => {
    // Act
    const obj = tryParseStdoutJson('  {"ok":true}  \n');
    const arr = tryParseStdoutJson("[1,2]");

    // Assert
    expect(obj).toEqual({ ok: true });
    expect(arr).toEqual([1, 2]);
  });
});
