import { describe, expect, it } from "vitest";
import { nextEventRelPath } from "./event-path";

describe("nextEventRelPath", () => {
  it("uses UTC year and month folders with injected id", () => {
    // Setup
    const id = "a".repeat(26);

    // Act
    const p = nextEventRelPath(new Date("2026-04-10T12:00:00.000Z"), {
      nextId: () => id,
    });

    // Assert
    expect(p).toBe(`events/2026/04/part-${id}.jsonl`);
  });

  it("pads single-digit UTC months", () => {
    // Setup
    const id = "b".repeat(26);

    // Act
    const p = nextEventRelPath(new Date("2026-01-05T00:00:00.000Z"), {
      nextId: () => id,
    });

    // Assert
    expect(p).toBe(`events/2026/01/part-${id}.jsonl`);
  });

  it("defaults to a lowercase ULID-shaped segment", () => {
    // Act
    const p = nextEventRelPath(new Date("2026-06-01T00:00:00.000Z"));

    // Assert
    expect(p).toMatch(
      /^events\/2026\/06\/part-[0-9a-z]{26}\.jsonl$/,
    );
  });

  it("produces distinct paths on successive calls with default id", () => {
    // Act
    const a = nextEventRelPath(new Date("2026-06-01T00:00:00.000Z"));
    const b = nextEventRelPath(new Date("2026-06-01T00:00:00.000Z"));

    // Assert
    expect(a).not.toBe(b);
  });
});
