import { describe, expect, it } from "vitest";
import { nextEventRelPath } from "./event-path";

describe("nextEventRelPath", () => {
  it("uses UTC year and month folders", () => {
    const p = nextEventRelPath(new Date("2026-04-10T12:00:00.000Z"));
    expect(p.startsWith("events/2026/04/part-")).toBe(true);
    expect(p.endsWith(".jsonl")).toBe(true);
  });
});
