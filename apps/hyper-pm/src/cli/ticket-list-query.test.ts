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
  storyId: "s1",
  title: "Hello World",
  body: "",
  status: "todo" as const,
  linkedPrs: [] as number[],
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
});
