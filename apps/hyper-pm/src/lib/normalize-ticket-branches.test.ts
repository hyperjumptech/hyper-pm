import { describe, expect, it } from "vitest";
import {
  normalizeTicketBranchListFromPayloadValue,
  normalizeTicketBranchListFromStrings,
  normalizeTicketBranchName,
} from "./normalize-ticket-branches";

describe("normalizeTicketBranchName", () => {
  it("trims and returns valid branch names", () => {
    // Act
    const out = normalizeTicketBranchName("  feature/foo  ");

    // Assert
    expect(out).toBe("feature/foo");
  });

  it("strips refs/heads/ prefix", () => {
    // Act
    const out = normalizeTicketBranchName("refs/heads/feature/bar");

    // Assert
    expect(out).toBe("feature/bar");
  });

  it("returns undefined for empty and whitespace-only input", () => {
    // Act
    const a = normalizeTicketBranchName("");
    const b = normalizeTicketBranchName("   ");

    // Assert
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
  });

  it("returns undefined when control characters are present", () => {
    // Act
    const out = normalizeTicketBranchName("bad\nname");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("normalizeTicketBranchListFromStrings", () => {
  it("deduplicates while preserving first-seen order", () => {
    // Setup
    const input = ["a", "  b ", "a", "refs/heads/c", "c"];

    // Act
    const out = normalizeTicketBranchListFromStrings(input);

    // Assert
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("drops invalid entries", () => {
    // Act
    const out = normalizeTicketBranchListFromStrings(["ok", "", "  ", "x\ny"]);

    // Assert
    expect(out).toEqual(["ok"]);
  });
});

describe("normalizeTicketBranchListFromPayloadValue", () => {
  it("returns empty array for non-array values", () => {
    // Act
    const a = normalizeTicketBranchListFromPayloadValue(null);
    const b = normalizeTicketBranchListFromPayloadValue("x");
    const c = normalizeTicketBranchListFromPayloadValue({});

    // Assert
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(c).toEqual([]);
  });

  it("keeps only string elements from an array", () => {
    // Act
    const out = normalizeTicketBranchListFromPayloadValue([
      "z",
      1,
      null,
      "refs/heads/z",
    ]);

    // Assert
    expect(out).toEqual(["z"]);
  });
});
