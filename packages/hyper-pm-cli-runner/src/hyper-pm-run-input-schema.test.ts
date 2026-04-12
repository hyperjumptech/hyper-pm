/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { hyperPmRunInputSchema } from "./hyper-pm-run-input-schema";

describe("hyperPmRunInputSchema", () => {
  it("accepts argv-only input", () => {
    // Act
    const r = hyperPmRunInputSchema.parse({ argv: ["doctor"] });

    // Assert
    expect(r.argv).toEqual(["doctor"]);
  });

  it("rejects invalid sync values", () => {
    // Act & Assert
    expect(() =>
      hyperPmRunInputSchema.parse({
        argv: ["sync"],
        sync: "invalid",
      }),
    ).toThrow();
  });
});
