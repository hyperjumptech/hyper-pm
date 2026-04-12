import { describe, expect, it } from "vitest";
import {
  isValidTicketEstimate,
  normalizeTicketLabelList,
  ticketLabelListsEqual,
  readTicketEstimatePatch,
  readTicketIsoInstantPatch,
  readTicketPriorityPatch,
  readTicketSizePatch,
  ticketLabelsFromPayloadValue,
  ticketPrioritySortRank,
  ticketSizeSortRank,
  tryParseTicketPriority,
  tryParseTicketSize,
} from "./ticket-planning-fields";

describe("tryParseTicketPriority", () => {
  it("parses known priorities case-insensitively", () => {
    // Act + Assert
    expect(tryParseTicketPriority("LOW")).toBe("low");
    expect(tryParseTicketPriority(" Medium ")).toBe("medium");
    expect(tryParseTicketPriority("high")).toBe("high");
    expect(tryParseTicketPriority("URGENT")).toBe("urgent");
  });

  it("returns undefined for unknown values", () => {
    // Act
    const out = tryParseTicketPriority("p0");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("tryParseTicketSize", () => {
  it("parses known sizes case-insensitively", () => {
    // Act + Assert
    expect(tryParseTicketSize("XS")).toBe("xs");
    expect(tryParseTicketSize(" M ")).toBe("m");
    expect(tryParseTicketSize("xl")).toBe("xl");
  });

  it("returns undefined for unknown values", () => {
    // Act
    const out = tryParseTicketSize("xxl");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("ticketLabelListsEqual", () => {
  it("compares normalized lists and treats undefined as empty", () => {
    // Assert
    expect(ticketLabelListsEqual(["a", " a "], ["a"])).toBe(true);
    expect(ticketLabelListsEqual(undefined, [])).toBe(true);
    expect(ticketLabelListsEqual(["a"], ["b"])).toBe(false);
  });
});

describe("normalizeTicketLabelList", () => {
  it("trims, drops empty, and dedupes preserving first occurrence", () => {
    // Setup
    const raw = [" a ", "", "b", " a ", "c", "b"];

    // Act
    const out = normalizeTicketLabelList(raw);

    // Assert
    expect(out).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for all empty", () => {
    // Act
    const out = normalizeTicketLabelList(["", "  "]);

    // Assert
    expect(out).toEqual([]);
  });
});

describe("ticketLabelsFromPayloadValue", () => {
  it("returns undefined when value is not an array", () => {
    // Act
    const out = ticketLabelsFromPayloadValue("x");

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns undefined when any element is not a string", () => {
    // Act
    const out = ticketLabelsFromPayloadValue(["ok", 1]);

    // Assert
    expect(out).toBeUndefined();
  });

  it("normalizes a valid string array", () => {
    // Act
    const out = ticketLabelsFromPayloadValue(["x", " x "]);

    // Assert
    expect(out).toEqual(["x"]);
  });
});

describe("readTicketPriorityPatch", () => {
  it("returns undefined when key is absent", () => {
    // Act
    const out = readTicketPriorityPatch({});

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns null when priority is null", () => {
    // Act
    const out = readTicketPriorityPatch({ priority: null });

    // Assert
    expect(out).toBeNull();
  });

  it("returns parsed priority for valid string", () => {
    // Act
    const out = readTicketPriorityPatch({ priority: "high" });

    // Assert
    expect(out).toBe("high");
  });

  it("returns undefined for invalid type or string", () => {
    // Act
    const a = readTicketPriorityPatch({ priority: 1 });
    const b = readTicketPriorityPatch({ priority: "nope" });

    // Assert
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
  });
});

describe("readTicketSizePatch", () => {
  it("returns undefined when key is absent", () => {
    // Act
    const out = readTicketSizePatch({});

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns null when size is null", () => {
    // Act
    const out = readTicketSizePatch({ size: null });

    // Assert
    expect(out).toBeNull();
  });

  it("returns parsed size for valid string", () => {
    // Act
    const out = readTicketSizePatch({ size: "l" });

    // Assert
    expect(out).toBe("l");
  });

  it("returns undefined for invalid type or string", () => {
    // Act
    const a = readTicketSizePatch({ size: true });
    const b = readTicketSizePatch({ size: "xxl" });

    // Assert
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
  });
});

describe("readTicketEstimatePatch", () => {
  it("returns undefined when key is absent", () => {
    // Act
    const out = readTicketEstimatePatch({});

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns null when estimate is null", () => {
    // Act
    const out = readTicketEstimatePatch({ estimate: null });

    // Assert
    expect(out).toBeNull();
  });

  it("returns number for valid finite non-negative estimate", () => {
    // Act
    const out = readTicketEstimatePatch({ estimate: 3.5 });

    // Assert
    expect(out).toBe(3.5);
  });

  it("returns undefined for NaN, infinite, negative, or non-number", () => {
    // Act
    const a = readTicketEstimatePatch({ estimate: Number.NaN });
    const b = readTicketEstimatePatch({ estimate: Number.POSITIVE_INFINITY });
    const c = readTicketEstimatePatch({ estimate: -1 });
    const d = readTicketEstimatePatch({ estimate: "2" });

    // Assert
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(c).toBeUndefined();
    expect(d).toBeUndefined();
  });
});

describe("isValidTicketEstimate", () => {
  it("returns true only for finite non-negative numbers", () => {
    // Assert
    expect(isValidTicketEstimate(0)).toBe(true);
    expect(isValidTicketEstimate(2)).toBe(true);
    expect(isValidTicketEstimate(-1)).toBe(false);
    expect(isValidTicketEstimate(Number.NaN)).toBe(false);
    expect(isValidTicketEstimate("1")).toBe(false);
    expect(isValidTicketEstimate(null)).toBe(false);
  });
});

describe("readTicketIsoInstantPatch", () => {
  it("returns undefined when key is absent", () => {
    // Act
    const out = readTicketIsoInstantPatch({}, "startWorkAt");

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns null when value is null", () => {
    // Act
    const out = readTicketIsoInstantPatch({ startWorkAt: null }, "startWorkAt");

    // Assert
    expect(out).toBeNull();
  });

  it("returns trimmed string when parseable", () => {
    // Act
    const out = readTicketIsoInstantPatch(
      { targetFinishAt: " 2026-01-02T00:00:00.000Z " },
      "targetFinishAt",
    );

    // Assert
    expect(out).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns undefined for empty, non-string, or non-parseable", () => {
    // Act
    const a = readTicketIsoInstantPatch({ startWorkAt: "" }, "startWorkAt");
    const b = readTicketIsoInstantPatch({ startWorkAt: "   " }, "startWorkAt");
    const c = readTicketIsoInstantPatch({ startWorkAt: 1 }, "startWorkAt");
    const d = readTicketIsoInstantPatch(
      { startWorkAt: "not-a-date" },
      "startWorkAt",
    );

    // Assert
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(c).toBeUndefined();
    expect(d).toBeUndefined();
  });
});

describe("ticketPrioritySortRank", () => {
  it("orders priorities and sends undefined last", () => {
    // Assert
    expect(ticketPrioritySortRank("low")).toBeLessThan(
      ticketPrioritySortRank("medium"),
    );
    expect(ticketPrioritySortRank(undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("ticketSizeSortRank", () => {
  it("orders sizes and sends undefined last", () => {
    // Assert
    expect(ticketSizeSortRank("xs")).toBeLessThan(ticketSizeSortRank("s"));
    expect(ticketSizeSortRank(undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});
