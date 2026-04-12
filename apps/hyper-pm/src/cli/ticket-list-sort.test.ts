/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { TicketRecord } from "../storage/projection";
import {
  auditInstantMsForSort,
  compareTicketsForListSort,
  DEFAULT_TICKET_LIST_SORT_DIR,
  DEFAULT_TICKET_LIST_SORT_FIELD,
  lastPrActivityMsForSort,
  sortTicketRecordsForList,
  tryParseTicketListSortDir,
  tryParseTicketListSortField,
} from "./ticket-list-sort";

const baseTicket = (over: Partial<TicketRecord>): TicketRecord => ({
  id: "t1",
  storyId: "s1",
  title: "Alpha",
  body: "",
  status: "todo",
  linkedPrs: [],
  linkedBranches: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "a",
  updatedAt: "2026-01-02T00:00:00.000Z",
  updatedBy: "b",
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  statusChangedBy: "a",
  ...over,
});

describe("tryParseTicketListSortField", () => {
  it("returns default id when raw is undefined", () => {
    // Act
    const out = tryParseTicketListSortField(undefined);

    // Assert
    expect(out).toBe(DEFAULT_TICKET_LIST_SORT_FIELD);
  });

  it("returns default id when raw is blank", () => {
    // Act
    const out = tryParseTicketListSortField("   ");

    // Assert
    expect(out).toBe(DEFAULT_TICKET_LIST_SORT_FIELD);
  });

  it("returns the field for a supported keyword", () => {
    // Act
    const out = tryParseTicketListSortField("  title  ");

    // Assert
    expect(out).toBe("title");
  });

  it("returns undefined for an unknown keyword", () => {
    // Act
    const out = tryParseTicketListSortField("nope");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("tryParseTicketListSortDir", () => {
  it("returns default asc when raw is undefined", () => {
    // Act
    const out = tryParseTicketListSortDir(undefined);

    // Assert
    expect(out).toBe(DEFAULT_TICKET_LIST_SORT_DIR);
  });

  it("accepts asc and desc case-insensitively", () => {
    // Act
    const asc = tryParseTicketListSortDir("ASC");
    const desc = tryParseTicketListSortDir(" DeSc ");

    // Assert
    expect(asc).toBe("asc");
    expect(desc).toBe("desc");
  });

  it("returns undefined for invalid direction", () => {
    // Act
    const out = tryParseTicketListSortDir("sideways");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("auditInstantMsForSort", () => {
  it("returns epoch ms for valid ISO strings", () => {
    // Act
    const ms = auditInstantMsForSort("2026-06-15T12:00:00.000Z");

    // Assert
    expect(ms).toBe(Date.parse("2026-06-15T12:00:00.000Z"));
  });

  it("returns positive infinity for non-finite parses", () => {
    // Act
    const ms = auditInstantMsForSort("not-a-date");

    // Assert
    expect(ms).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("lastPrActivityMsForSort", () => {
  it("returns infinity when there is no activity", () => {
    // Setup
    const t = baseTicket({ prActivityRecent: undefined });

    // Act
    const ms = lastPrActivityMsForSort(t);

    // Assert
    expect(ms).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns infinity for an empty prActivityRecent array", () => {
    // Setup
    const t = baseTicket({ prActivityRecent: [] });

    // Act
    const ms = lastPrActivityMsForSort(t);

    // Assert
    expect(ms).toBe(Number.POSITIVE_INFINITY);
  });

  it("uses the tail activity occurredAt", () => {
    // Setup
    const t = baseTicket({
      prActivityRecent: [
        {
          prNumber: 1,
          kind: "commented",
          occurredAt: "2026-01-03T00:00:00.000Z",
          sourceId: "a",
        },
        {
          prNumber: 1,
          kind: "merged",
          occurredAt: "2026-01-10T00:00:00.000Z",
          sourceId: "b",
        },
      ],
    });

    // Act
    const ms = lastPrActivityMsForSort(t);

    // Assert
    expect(ms).toBe(Date.parse("2026-01-10T00:00:00.000Z"));
  });
});

describe("compareTicketsForListSort", () => {
  it("sorts by title ascending", () => {
    // Setup
    const a = baseTicket({ id: "t-a", title: "A" });
    const b = baseTicket({ id: "t-b", title: "B" });

    // Act
    const cmp = compareTicketsForListSort(a, b, "title", "asc");

    // Assert
    expect(cmp).toBeLessThan(0);
  });

  it("reverses primary order for desc", () => {
    // Setup
    const a = baseTicket({ id: "t-a", title: "A" });
    const b = baseTicket({ id: "t-b", title: "B" });

    // Act
    const cmp = compareTicketsForListSort(a, b, "title", "desc");

    // Assert
    expect(cmp).toBeGreaterThan(0);
  });

  it("breaks ties on id ascending regardless of sort direction", () => {
    // Setup
    const a = baseTicket({ id: "t-b", title: "Same" });
    const b = baseTicket({ id: "t-a", title: "Same" });

    // Act
    const asc = compareTicketsForListSort(a, b, "title", "asc");

    // Assert
    expect(asc).toBeGreaterThan(0);
  });

  it("orders status by workflow rank ascending", () => {
    // Setup
    const backlog = baseTicket({ id: "t1", status: "backlog" });
    const done = baseTicket({ id: "t2", status: "done" });

    // Act
    const cmp = compareTicketsForListSort(backlog, done, "status", "asc");

    // Assert
    expect(cmp).toBeLessThan(0);
  });

  it("places missing assignee after present for asc", () => {
    // Setup
    const withAssignee = baseTicket({ id: "t1", assignee: "pat" });
    const without = baseTicket({ id: "t2", assignee: undefined });

    // Act
    const cmp = compareTicketsForListSort(
      withAssignee,
      without,
      "assignee",
      "asc",
    );

    // Assert
    expect(cmp).toBeLessThan(0);
  });

  it("compares github issue numbers when both set", () => {
    // Setup
    const low = baseTicket({ id: "t1", githubIssueNumber: 3 });
    const high = baseTicket({ id: "t2", githubIssueNumber: 99 });

    // Act
    const cmp = compareTicketsForListSort(
      low,
      high,
      "githubIssueNumber",
      "asc",
    );

    // Assert
    expect(cmp).toBeLessThan(0);
  });

  it("places missing github issue after present for asc", () => {
    // Setup
    const withN = baseTicket({ id: "t1", githubIssueNumber: 5 });
    const without = baseTicket({ id: "t2", githubIssueNumber: undefined });

    // Act
    const cmp = compareTicketsForListSort(
      withN,
      without,
      "githubIssueNumber",
      "asc",
    );

    // Assert
    expect(cmp).toBeLessThan(0);
  });

  it("compares createdAt, updatedAt, and statusChangedAt as time", () => {
    // Setup
    const early = baseTicket({
      id: "t1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      statusChangedAt: "2026-01-01T00:00:00.000Z",
    });
    const late = baseTicket({
      id: "t2",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      statusChangedAt: "2026-06-01T00:00:00.000Z",
    });

    // Act
    const cCreated = compareTicketsForListSort(early, late, "createdAt", "asc");
    const cUpdated = compareTicketsForListSort(early, late, "updatedAt", "asc");
    const cStatus = compareTicketsForListSort(
      early,
      late,
      "statusChangedAt",
      "asc",
    );

    // Assert
    expect(cCreated).toBeLessThan(0);
    expect(cUpdated).toBeLessThan(0);
    expect(cStatus).toBeLessThan(0);
  });

  it("compares storyId and id lexicographically", () => {
    // Setup
    const a = baseTicket({ id: "t1", storyId: "s-a" });
    const b = baseTicket({ id: "t2", storyId: "s-b" });

    // Act
    const byStory = compareTicketsForListSort(a, b, "storyId", "asc");
    const byId = compareTicketsForListSort(a, b, "id", "asc");

    // Assert
    expect(byStory).toBeLessThan(0);
    expect(byId).toBeLessThan(0);
  });

  it("sorts null storyId like empty string before non-empty story ids", () => {
    const orphan = baseTicket({ id: "t1", storyId: null });
    const linked = baseTicket({ id: "t2", storyId: "s-a" });
    expect(
      compareTicketsForListSort(orphan, linked, "storyId", "asc"),
    ).toBeLessThan(0);
    expect(
      compareTicketsForListSort(linked, orphan, "storyId", "asc"),
    ).toBeGreaterThan(0);
  });

  it("orders lastPrActivityAt by tail timestamp", () => {
    // Setup
    const early = baseTicket({
      id: "t1",
      prActivityRecent: [
        {
          prNumber: 1,
          kind: "commented",
          occurredAt: "2026-01-01T00:00:00.000Z",
          sourceId: "a",
        },
      ],
    });
    const late = baseTicket({
      id: "t2",
      prActivityRecent: [
        {
          prNumber: 2,
          kind: "merged",
          occurredAt: "2026-02-01T00:00:00.000Z",
          sourceId: "b",
        },
      ],
    });

    // Act
    const cmp = compareTicketsForListSort(
      early,
      late,
      "lastPrActivityAt",
      "asc",
    );

    // Assert
    expect(cmp).toBeLessThan(0);
  });

  it("compares priority and size ranks", () => {
    const low = baseTicket({ id: "t1", priority: "low" });
    const urgent = baseTicket({ id: "t2", priority: "urgent" });
    expect(
      compareTicketsForListSort(low, urgent, "priority", "asc"),
    ).toBeLessThan(0);
    const xs = baseTicket({ id: "t1", size: "xs" });
    const xl = baseTicket({ id: "t2", size: "xl" });
    expect(compareTicketsForListSort(xs, xl, "size", "asc")).toBeLessThan(0);
  });

  it("compares estimate and places missing last for asc", () => {
    const a = baseTicket({ id: "t1", estimate: 1 });
    const b = baseTicket({ id: "t2", estimate: 10 });
    expect(compareTicketsForListSort(a, b, "estimate", "asc")).toBeLessThan(0);
    const none = baseTicket({ id: "t3", estimate: undefined });
    expect(compareTicketsForListSort(a, none, "estimate", "asc")).toBeLessThan(
      0,
    );
  });

  it("compares startWorkAt and targetFinishAt as time", () => {
    const early = baseTicket({
      id: "t1",
      startWorkAt: "2026-01-01T00:00:00.000Z",
      targetFinishAt: "2026-01-05T00:00:00.000Z",
    });
    const late = baseTicket({
      id: "t2",
      startWorkAt: "2026-06-01T00:00:00.000Z",
      targetFinishAt: "2026-06-10T00:00:00.000Z",
    });
    expect(
      compareTicketsForListSort(early, late, "startWorkAt", "asc"),
    ).toBeLessThan(0);
    expect(
      compareTicketsForListSort(early, late, "targetFinishAt", "asc"),
    ).toBeLessThan(0);
  });
});

describe("sortTicketRecordsForList", () => {
  it("returns a new sorted array without mutating the input", () => {
    // Setup
    const a = baseTicket({ id: "b", title: "x" });
    const c = baseTicket({ id: "a", title: "y" });
    const input: TicketRecord[] = [a, c];

    // Act
    const out = sortTicketRecordsForList(input, "id", "asc");

    // Assert
    expect(out.map((t) => t.id)).toEqual(["a", "b"]);
    expect(input.at(0)?.id).toBe("b");
  });
});
