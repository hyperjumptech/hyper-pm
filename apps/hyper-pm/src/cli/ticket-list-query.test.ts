/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { Projection } from "../storage/projection";
import {
  ticketMatchesTicketListQuery,
  tryParseIsoDateMillis,
  type TicketListQuery,
} from "./ticket-list-query";

const emptyProjection = (): Projection => ({
  epics: new Map(),
  stories: new Map(),
  tickets: new Map(),
});

const audit = {
  createdAt: "2026-01-10T12:00:00.000Z",
  createdBy: "alice",
  updatedAt: "2026-01-11T12:00:00.000Z",
  updatedBy: "bob",
} as const;

const statusAudit = {
  statusChangedAt: "2026-01-10T12:00:00.000Z",
  statusChangedBy: "alice",
} as const;

const baseTicket = {
  id: "t1",
  number: 1,
  storyId: "s1",
  title: "Hello World",
  body: "",
  status: "todo" as const,
  linkedPrs: [] as number[],
  linkedBranches: [] as string[],
  ...audit,
  ...statusAudit,
};

describe("tryParseIsoDateMillis", () => {
  it("parses valid ISO strings", () => {
    expect(tryParseIsoDateMillis("2026-01-01T00:00:00.000Z")).toBe(
      Date.parse("2026-01-01T00:00:00.000Z"),
    );
  });

  it("returns null for invalid input", () => {
    expect(tryParseIsoDateMillis("not-a-date")).toBeNull();
    expect(tryParseIsoDateMillis("")).toBeNull();
  });
});

describe("ticketMatchesTicketListQuery", () => {
  it("matches any ticket when query is empty", () => {
    const projection = emptyProjection();
    const q: TicketListQuery = {};
    expect(ticketMatchesTicketListQuery(baseTicket, projection, q)).toBe(true);
  });

  it("filters by status OR-set", () => {
    const projection = emptyProjection();
    const q: TicketListQuery = { statuses: ["done", "in_progress"] };
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, status: "todo" },
        projection,
        q,
      ),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, status: "in_progress" },
        projection,
        q,
      ),
    ).toBe(true);
  });

  it("matches epic when story exists and belongs to epic", () => {
    const projection: Projection = {
      ...emptyProjection(),
      stories: new Map([
        [
          "s1",
          {
            id: "s1",
            number: 1,
            epicId: "e1",
            title: "S",
            body: "",
            status: "backlog",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    };
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, { epicId: "e1" }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, { epicId: "e2" }),
    ).toBe(false);
  });

  it("does not match epic when story is deleted", () => {
    const projection: Projection = {
      ...emptyProjection(),
      stories: new Map([
        [
          "s1",
          {
            id: "s1",
            number: 1,
            epicId: "e1",
            title: "S",
            body: "",
            status: "backlog",
            deleted: true,
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    };
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, { epicId: "e1" }),
    ).toBe(false);
  });

  it("applies inclusive createdAt bounds", () => {
    const projection = emptyProjection();
    const ms = Date.parse("2026-01-10T12:00:00.000Z");
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        createdAfterMs: ms,
        createdBeforeMs: ms,
      }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        createdAfterMs: ms + 1,
      }),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        createdBeforeMs: ms - 1,
      }),
    ).toBe(false);
  });

  it("matches createdBy substring (case-sensitive)", () => {
    const projection = emptyProjection();
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        createdByContains: "lic",
      }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        createdByContains: "LIC",
      }),
    ).toBe(false);
  });

  it("matches title substring case-insensitively via lowercase needle", () => {
    const projection = emptyProjection();
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        titleContainsLower: "world",
      }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        titleContainsLower: "missing",
      }),
    ).toBe(false);
  });

  it("requires githubIssueNumber when githubLinkedOnly is true", () => {
    const projection = emptyProjection();
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        githubLinkedOnly: true,
      }),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, githubIssueNumber: 42 },
        projection,
        { githubLinkedOnly: true },
      ),
    ).toBe(true);
  });

  it("filters withoutStoryOnly to tickets with null storyId", () => {
    const projection = emptyProjection();
    const orphan = { ...baseTicket, id: "t0", number: 2, storyId: null };
    expect(
      ticketMatchesTicketListQuery(orphan, projection, {
        withoutStoryOnly: true,
      }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(baseTicket, projection, {
        withoutStoryOnly: true,
      }),
    ).toBe(false);
  });

  it("does not match epicId when ticket has no story", () => {
    const projection: Projection = {
      ...emptyProjection(),
      stories: new Map([
        [
          "s1",
          {
            id: "s1",
            number: 1,
            epicId: "e1",
            title: "S",
            body: "",
            status: "backlog",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    };
    const orphan = { ...baseTicket, storyId: null };
    expect(
      ticketMatchesTicketListQuery(orphan, projection, { epicId: "e1" }),
    ).toBe(false);
  });

  it("filters by linked branch using normalized exact match", () => {
    // Setup
    const projection = emptyProjection();

    // Act / Assert
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, linkedBranches: ["feature/x"] },
        projection,
        { branchNormalized: "feature/x" },
      ),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, linkedBranches: ["other"] },
        projection,
        { branchNormalized: "feature/x" },
      ),
    ).toBe(false);
  });

  it("filters by priority OR-set", () => {
    const projection = emptyProjection();
    const q: TicketListQuery = { priorities: ["high", "urgent"] };
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, priority: "low" },
        projection,
        q,
      ),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, priority: "high" },
        projection,
        q,
      ),
    ).toBe(true);
    expect(ticketMatchesTicketListQuery({ ...baseTicket }, projection, q)).toBe(
      false,
    );
  });

  it("filters by size OR-set", () => {
    const projection = emptyProjection();
    const q: TicketListQuery = { sizes: ["s", "m"] };
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, size: "xl" },
        projection,
        q,
      ),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery({ ...baseTicket, size: "m" }, projection, q),
    ).toBe(true);
  });

  it("filters by labelsAll (AND)", () => {
    const projection = emptyProjection();
    const q: TicketListQuery = { labelsAll: ["a", "b"] };
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, labels: ["a"] },
        projection,
        q,
      ),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, labels: ["a", "b"] },
        projection,
        q,
      ),
    ).toBe(true);
  });

  it("filters by estimate bounds", () => {
    const projection = emptyProjection();
    expect(
      ticketMatchesTicketListQuery({ ...baseTicket, estimate: 5 }, projection, {
        estimateMin: 3,
        estimateMax: 7,
      }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery({ ...baseTicket, estimate: 2 }, projection, {
        estimateMin: 3,
      }),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery({ ...baseTicket }, projection, {
        estimateMax: 1,
      }),
    ).toBe(false);
  });

  it("filters by startWorkAt and targetFinishAt bounds", () => {
    const projection = emptyProjection();
    const t = {
      ...baseTicket,
      startWorkAt: "2026-02-15T12:00:00.000Z",
      targetFinishAt: "2026-02-20T12:00:00.000Z",
    };
    const mid = Date.parse("2026-02-16T00:00:00.000Z");
    expect(
      ticketMatchesTicketListQuery(t, projection, {
        startWorkAfterMs: mid,
      }),
    ).toBe(false);
    expect(
      ticketMatchesTicketListQuery(t, projection, {
        startWorkBeforeMs: mid,
      }),
    ).toBe(true);
    expect(
      ticketMatchesTicketListQuery(t, projection, {
        targetFinishAfterMs: Date.parse("2026-02-19T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("filters by dependsOnIncludesId", () => {
    // Setup
    const projection = emptyProjection();
    const q: TicketListQuery = { dependsOnIncludesId: "dep1" };

    // Assert
    expect(
      ticketMatchesTicketListQuery(
        { ...baseTicket, dependsOn: ["dep1", "dep2"] },
        projection,
        q,
      ),
    ).toBe(true);
    expect(ticketMatchesTicketListQuery({ ...baseTicket }, projection, q)).toBe(
      false,
    );
  });
});
