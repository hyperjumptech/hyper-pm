import { describe, expect, it } from "vitest";
import type { Projection, TicketRecord } from "../storage/projection";
import {
  normalizeTicketDependsOnIds,
  parseTicketDependsOnFromFenceValue,
  parseTicketDependsOnFromPayloadValue,
  ticketDependsOnListsEqual,
  ticketDependsOnSuccessorsForProjection,
  validateTicketDependsOnForWrite,
  wouldTicketDependsOnCreateCycle,
} from "./ticket-depends-on";

const minimalTicket = (
  id: string,
  over: Partial<TicketRecord> & Pick<TicketRecord, "dependsOn">,
): TicketRecord =>
  ({
    id,
    storyId: null,
    title: "",
    body: "",
    status: "todo",
    linkedPrs: [],
    linkedBranches: [],
    createdAt: "",
    createdBy: "",
    updatedAt: "",
    updatedBy: "",
    statusChangedAt: "",
    statusChangedBy: "",
    ...over,
  }) as TicketRecord;

describe("normalizeTicketDependsOnIds", () => {
  it("trims, drops empties, and dedupes by first occurrence", () => {
    // Act
    const out = normalizeTicketDependsOnIds(["  a ", "", "b", "  a", "b"]);

    // Assert
    expect(out).toEqual(["a", "b"]);
  });

  it("returns empty array for empty input", () => {
    // Act
    const out = normalizeTicketDependsOnIds([]);

    // Assert
    expect(out).toEqual([]);
  });
});

describe("ticketDependsOnListsEqual", () => {
  it("returns true for equivalent lists after normalization", () => {
    // Assert
    expect(ticketDependsOnListsEqual([" x ", "y"], ["x", "y"])).toBe(true);
    expect(ticketDependsOnListsEqual(undefined, undefined)).toBe(true);
    expect(ticketDependsOnListsEqual(undefined, [])).toBe(true);
    expect(ticketDependsOnListsEqual([], undefined)).toBe(true);
  });

  it("returns false when order or members differ", () => {
    // Assert
    expect(ticketDependsOnListsEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(ticketDependsOnListsEqual(["a"], ["a", "b"])).toBe(false);
  });
});

describe("parseTicketDependsOnFromPayloadValue", () => {
  it("parses a string array and normalizes", () => {
    // Act
    const out = parseTicketDependsOnFromPayloadValue([" t1 ", "t2", "t1"]);

    // Assert
    expect(out).toEqual(["t1", "t2"]);
  });

  it("returns undefined for non-array or non-string elements", () => {
    // Assert
    expect(parseTicketDependsOnFromPayloadValue(null)).toBeUndefined();
    expect(parseTicketDependsOnFromPayloadValue(["a", 1])).toBeUndefined();
    expect(parseTicketDependsOnFromPayloadValue({})).toBeUndefined();
  });
});

describe("parseTicketDependsOnFromFenceValue", () => {
  it("keeps only string elements and normalizes", () => {
    // Act
    const out = parseTicketDependsOnFromFenceValue(["a", 1, " a ", "b"]);

    // Assert
    expect(out).toEqual(["a", "b"]);
  });

  it("returns undefined when value is not an array", () => {
    // Assert
    expect(parseTicketDependsOnFromFenceValue("x")).toBeUndefined();
  });
});

describe("wouldTicketDependsOnCreateCycle", () => {
  it("detects a two-node cycle using successorsFor", () => {
    // Setup
    const successorsFor = (id: string): readonly string[] | undefined => {
      if (id === "A") return ["B"];
      if (id === "B") return ["A"];
      return undefined;
    };

    // Act
    const cycle = wouldTicketDependsOnCreateCycle({
      fromTicketId: "A",
      nextDependsOn: ["B"],
      successorsFor,
    });

    // Assert
    expect(cycle).toBe(true);
  });

  it("returns false when prerequisites do not reach fromTicketId", () => {
    // Setup
    const successorsFor = (id: string): readonly string[] | undefined => {
      if (id === "A") return ["B"];
      if (id === "B") return [];
      return undefined;
    };

    // Act
    const cycle = wouldTicketDependsOnCreateCycle({
      fromTicketId: "A",
      nextDependsOn: ["B"],
      successorsFor,
    });

    // Assert
    expect(cycle).toBe(false);
  });

  it("returns true when a longer chain leads back to fromTicketId", () => {
    // Setup
    const successorsFor = (id: string): readonly string[] | undefined => {
      if (id === "A") return ["B"];
      if (id === "B") return ["C"];
      if (id === "C") return ["A"];
      return undefined;
    };

    // Act
    const cycle = wouldTicketDependsOnCreateCycle({
      fromTicketId: "A",
      nextDependsOn: ["B"],
      successorsFor,
    });

    // Assert
    expect(cycle).toBe(true);
  });
});

describe("ticketDependsOnSuccessorsForProjection", () => {
  it("uses nextDependsOn for fromTicketId and projection rows otherwise", () => {
    // Setup
    const tickets = new Map<string, TicketRecord>([
      ["t1", minimalTicket("t1", { dependsOn: ["t2"] })],
      ["t2", minimalTicket("t2", { dependsOn: [] })],
    ]);
    const projection: Projection = {
      epics: new Map(),
      stories: new Map(),
      tickets,
    };
    const lookup = ticketDependsOnSuccessorsForProjection(projection, "t1", [
      "t2",
    ]);

    // Act & Assert
    expect(lookup("t1")).toEqual(["t2"]);
    expect(lookup("t2")).toEqual([]);
  });

  it("returns undefined for missing or deleted tickets", () => {
    // Setup
    const tickets = new Map<string, TicketRecord>([
      ["gone", { ...minimalTicket("gone", { dependsOn: [] }), deleted: true }],
    ]);
    const projection: Projection = {
      epics: new Map(),
      stories: new Map(),
      tickets,
    };
    const lookup = ticketDependsOnSuccessorsForProjection(projection, "x", []);

    // Assert
    expect(lookup("missing")).toBeUndefined();
    expect(lookup("gone")).toBeUndefined();
  });
});

describe("validateTicketDependsOnForWrite", () => {
  it("returns undefined for a valid non-cyclic dependency", () => {
    // Setup
    const tickets = new Map<string, TicketRecord>([
      ["t1", minimalTicket("t1", { dependsOn: [] })],
      ["t2", minimalTicket("t2", { dependsOn: [] })],
    ]);
    const projection: Projection = {
      epics: new Map(),
      stories: new Map(),
      tickets,
    };

    // Act
    const err = validateTicketDependsOnForWrite({
      projection,
      fromTicketId: "t1",
      nextDependsOn: ["t2"],
    });

    // Assert
    expect(err).toBeUndefined();
  });

  it("rejects self-dependency", () => {
    // Setup
    const projection: Projection = {
      epics: new Map(),
      stories: new Map(),
      tickets: new Map([["t1", minimalTicket("t1", { dependsOn: [] })]]),
    };

    // Act
    const err = validateTicketDependsOnForWrite({
      projection,
      fromTicketId: "t1",
      nextDependsOn: ["t1"],
    });

    // Assert
    expect(err).toContain("cannot depend on itself");
  });

  it("rejects missing or deleted prerequisites", () => {
    // Setup
    const projection: Projection = {
      epics: new Map(),
      stories: new Map(),
      tickets: new Map([
        ["t1", minimalTicket("t1", { dependsOn: [] })],
        [
          "gone",
          { ...minimalTicket("gone", { dependsOn: [] }), deleted: true },
        ],
      ]),
    };

    // Assert
    expect(
      validateTicketDependsOnForWrite({
        projection,
        fromTicketId: "t1",
        nextDependsOn: ["nope"],
      }),
    ).toContain("not found");
    expect(
      validateTicketDependsOnForWrite({
        projection,
        fromTicketId: "t1",
        nextDependsOn: ["gone"],
      }),
    ).toContain("deleted");
  });

  it("rejects cycles in the projection graph", () => {
    // Setup
    const projection: Projection = {
      epics: new Map(),
      stories: new Map(),
      tickets: new Map([
        ["t1", minimalTicket("t1", { dependsOn: ["t2"] })],
        ["t2", minimalTicket("t2", { dependsOn: [] })],
      ]),
    };

    // Act
    const err = validateTicketDependsOnForWrite({
      projection,
      fromTicketId: "t2",
      nextDependsOn: ["t1"],
    });

    // Assert
    expect(err).toContain("cycle");
  });
});
