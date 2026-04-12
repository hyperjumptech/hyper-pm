/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type {
  EpicRecord,
  Projection,
  StoryRecord,
  TicketRecord,
} from "../storage/projection";
import {
  assertCreatePayloadUsesExpectedHeadNumber,
  isDigitOnlyWorkItemRef,
  resolveEpicId,
  resolveStoryId,
  resolveTicketDependsOnTokensToIds,
  resolveTicketId,
} from "./resolve-projection-work-item-id";

const audit = {
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "a",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "a",
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  statusChangedBy: "a",
};

const epic = (
  over: Partial<EpicRecord> & Pick<EpicRecord, "id" | "number">,
): EpicRecord => ({
  title: "t",
  body: "",
  status: "backlog",
  ...audit,
  ...over,
});

const story = (
  over: Partial<StoryRecord> & Pick<StoryRecord, "id" | "number" | "epicId">,
): StoryRecord => ({
  title: "t",
  body: "",
  status: "backlog",
  ...audit,
  ...over,
});

const ticket = (
  over: Partial<TicketRecord> & Pick<TicketRecord, "id" | "number">,
): TicketRecord => ({
  storyId: null,
  title: "t",
  body: "",
  status: "todo",
  linkedPrs: [],
  linkedBranches: [],
  ...audit,
  ...over,
});

const projFrom = (p: {
  epics?: EpicRecord[];
  stories?: StoryRecord[];
  tickets?: TicketRecord[];
}): Projection => ({
  epics: new Map((p.epics ?? []).map((e) => [e.id, e])),
  stories: new Map((p.stories ?? []).map((s) => [s.id, s])),
  tickets: new Map((p.tickets ?? []).map((t) => [t.id, t])),
});

describe("isDigitOnlyWorkItemRef", () => {
  it("returns false for blank or non-digit tokens", () => {
    // Act
    const a = isDigitOnlyWorkItemRef("");
    const b = isDigitOnlyWorkItemRef("   ");
    const c = isDigitOnlyWorkItemRef("12a");

    // Assert
    expect(a).toBe(false);
    expect(b).toBe(false);
    expect(c).toBe(false);
  });

  it("returns true for trimmed digit-only strings", () => {
    // Act
    const out = isDigitOnlyWorkItemRef("  42 ");

    // Assert
    expect(out).toBe(true);
  });
});

describe("resolveEpicId", () => {
  it("prefers a direct epic id match over numeric interpretation", () => {
    // Setup
    const p = projFrom({
      epics: [epic({ id: "7", number: 1 }), epic({ id: "e2", number: 7 })],
    });

    // Act
    const byId = resolveEpicId(p, "7");
    const byNum = resolveEpicId(p, "7 ");

    // Assert
    expect(byId).toBe("7");
    expect(byNum).toBe("7");
  });

  it("resolves by number when the id map misses and the number is unique", () => {
    // Setup
    const p = projFrom({
      epics: [epic({ id: "e1", number: 5 })],
    });

    // Act
    const out = resolveEpicId(p, "5");

    // Assert
    expect(out).toBe("e1");
  });

  it("returns undefined when no epic matches or the number is ambiguous", () => {
    // Setup
    const p = projFrom({
      epics: [epic({ id: "a", number: 2 }), epic({ id: "b", number: 2 })],
    });

    // Act
    const none = resolveEpicId(p, "99");
    const ambiguous = resolveEpicId(p, "2");

    // Assert
    expect(none).toBeUndefined();
    expect(ambiguous).toBeUndefined();
  });
});

describe("resolveStoryId", () => {
  it("resolves by id first then by unique number", () => {
    // Setup
    const p = projFrom({
      stories: [story({ id: "s1", number: 3, epicId: "e1" })],
    });

    // Act
    const a = resolveStoryId(p, "s1");
    const b = resolveStoryId(p, "3");

    // Assert
    expect(a).toBe("s1");
    expect(b).toBe("s1");
  });
});

describe("resolveTicketId", () => {
  it("returns undefined when digit token matches zero or many tickets", () => {
    // Setup
    const p = projFrom({
      tickets: [
        ticket({ id: "t1", number: 1 }),
        ticket({ id: "t2", number: 1 }),
      ],
    });

    // Act
    const out = resolveTicketId(p, "1");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("resolveTicketDependsOnTokensToIds", () => {
  it("resolves digit tokens to ids and normalizes the list", () => {
    // Setup
    const p = projFrom({
      tickets: [
        ticket({ id: "t9", number: 2 }),
        ticket({ id: "t8", number: 1 }),
      ],
    });

    // Act
    const out = resolveTicketDependsOnTokensToIds(p, [" 2 ", "t8", " 2"]);

    // Assert
    expect(out).toEqual(["t9", "t8"]);
  });
});

describe("assertCreatePayloadUsesExpectedHeadNumber", () => {
  it("throws when the payload number is not the next head value", () => {
    // Setup
    const p = projFrom({
      epics: [epic({ id: "e1", number: 1 })],
    });

    // Act
    const act = (): void => {
      assertCreatePayloadUsesExpectedHeadNumber(p, "epic", { number: 1 });
    };

    // Assert
    expect(act).toThrow(/expected 2/);
  });

  it("accepts the next epic number on an empty projection", () => {
    // Setup
    const p = projFrom({});

    // Act
    const act = (): void => {
      assertCreatePayloadUsesExpectedHeadNumber(p, "epic", { number: 1 });
    };

    // Assert
    expect(act).not.toThrow();
  });
});
