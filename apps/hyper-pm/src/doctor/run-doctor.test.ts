import { describe, expect, it } from "vitest";
import { runDoctorOnLines } from "./run-doctor";

describe("runDoctorOnLines", () => {
  it("flags invalid json", () => {
    const issues = runDoctorOnLines(["{"]);
    expect(issues[0]?.kind).toBe("invalid-json");
  });

  it("flags schema mismatch", () => {
    const issues = runDoctorOnLines([
      JSON.stringify({ schema: 1, type: "nope" }),
    ]);
    expect(issues[0]?.kind).toBe("invalid-event");
  });
});
