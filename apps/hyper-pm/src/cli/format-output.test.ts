import { describe, expect, it } from "vitest";
import { formatOutput } from "./format-output";

describe("formatOutput", () => {
  it("formats json mode", () => {
    expect(formatOutput("json", { a: 1 })).toBe('{"a":1}');
  });

  it("prints strings verbatim in text mode", () => {
    expect(formatOutput("text", "hi")).toBe("hi");
  });
});
