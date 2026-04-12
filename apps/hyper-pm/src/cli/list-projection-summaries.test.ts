/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { Projection } from "../storage/projection";
import {
  listActiveEpicSummaries,
  listActiveStorySummaries,
  listActiveTicketSummaries,
} from "./list-projection-summaries";

const audit = {
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "creator",
  updatedAt: "2026-01-02T00:00:00.000Z",
  updatedBy: "editor",
} as const;

const statusAudit = {
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  statusChangedBy: "creator",
} as const;

const projectionWith = (partial: Partial<Projection>): Projection => ({
  epics: new Map(),
  stories: new Map(),
  tickets: new Map(),
  ...partial,
});

describe("listActiveEpicSummaries", () => {
  it("omits deleted epics and sorts by id", () => {
    const projection = projectionWith({
      epics: new Map([
        [
          "b",
          {
            id: "b",
            title: "B",
            body: "",
            status: "backlog",
            deleted: true,
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "a",
          {
            id: "a",
            title: "A",
            body: "",
            status: "backlog",
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "c",
          {
            id: "c",
            title: "C",
            body: "",
            status: "todo",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveEpicSummaries(projection)).toEqual([
      { id: "a", title: "A", status: "backlog", ...audit },
      { id: "c", title: "C", status: "todo", ...audit },
    ]);
  });

  it("returns empty when no epics", () => {
    expect(listActiveEpicSummaries(projectionWith({}))).toEqual([]);
  });
});

describe("listActiveStorySummaries", () => {
  it("omits deleted stories and sorts by id", () => {
    const projection = projectionWith({
      stories: new Map([
        [
          "y",
          {
            id: "y",
            epicId: "e1",
            title: "Y",
            body: "",
            status: "backlog",
            deleted: true,
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "x",
          {
            id: "x",
            epicId: "e1",
            title: "X",
            body: "",
            status: "in_progress",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveStorySummaries(projection)).toEqual([
      { id: "x", epicId: "e1", title: "X", status: "in_progress", ...audit },
    ]);
  });

  it("filters by epicId when option is set", () => {
    const projection = projectionWith({
      stories: new Map([
        [
          "s-a",
          {
            id: "s-a",
            epicId: "e1",
            title: "A",
            body: "",
            status: "backlog",
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "s-b",
          {
            id: "s-b",
            epicId: "e2",
            title: "B",
            body: "",
            status: "todo",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveStorySummaries(projection, { epicId: "e1" })).toEqual([
      { id: "s-a", epicId: "e1", title: "A", status: "backlog", ...audit },
    ]);
  });

  it("returns empty when epicId filter matches no stories", () => {
    const projection = projectionWith({
      stories: new Map([
        [
          "s-a",
          {
            id: "s-a",
            epicId: "e1",
            title: "A",
            body: "",
            status: "backlog",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveStorySummaries(projection, { epicId: "missing" })).toEqual(
      [],
    );
  });
});

describe("listActiveTicketSummaries", () => {
  it("omits deleted tickets and preserves status", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t2",
          {
            id: "t2",
            storyId: "s1",
            title: "Closed",
            body: "",
            status: "done",
            linkedPrs: [],
            deleted: true,
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "t1",
          {
            id: "t1",
            storyId: "s1",
            title: "Open",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveTicketSummaries(projection)).toEqual([
      {
        id: "t1",
        title: "Open",
        status: "todo",
        storyId: "s1",
        ...audit,
      },
    ]);
  });

  it("includes assignee when set on the ticket", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t1",
          {
            id: "t1",
            storyId: "s1",
            title: "Open",
            body: "",
            status: "todo",
            linkedPrs: [],
            assignee: "alice",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveTicketSummaries(projection)).toEqual([
      {
        id: "t1",
        title: "Open",
        status: "todo",
        storyId: "s1",
        assignee: "alice",
        ...audit,
      },
    ]);
  });

  it("includes lastPrActivity from prActivityRecent tail", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t1",
          {
            id: "t1",
            storyId: "s1",
            title: "Open",
            body: "",
            status: "in_progress",
            linkedPrs: [10],
            prActivityRecent: [
              {
                prNumber: 10,
                kind: "commented",
                occurredAt: "2026-01-05T00:00:00.000Z",
                sourceId: "a",
              },
              {
                prNumber: 10,
                kind: "merged",
                occurredAt: "2026-01-06T00:00:00.000Z",
                sourceId: "b",
              },
            ],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveTicketSummaries(projection)).toEqual([
      {
        id: "t1",
        title: "Open",
        status: "in_progress",
        storyId: "s1",
        lastPrActivity: {
          prNumber: 10,
          kind: "merged",
          occurredAt: "2026-01-06T00:00:00.000Z",
        },
        ...audit,
      },
    ]);
  });

  it("filters by storyId when option is set", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t-a",
          {
            id: "t-a",
            storyId: "s1",
            title: "On S1",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "t-b",
          {
            id: "t-b",
            storyId: "s2",
            title: "On S2",
            body: "",
            status: "backlog",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(listActiveTicketSummaries(projection, { storyId: "s1" })).toEqual([
      {
        id: "t-a",
        title: "On S1",
        status: "todo",
        storyId: "s1",
        ...audit,
      },
    ]);
  });

  it("filters by withoutStoryOnly in query", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t-orphan",
          {
            id: "t-orphan",
            storyId: null,
            title: "No story",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "t-linked",
          {
            id: "t-linked",
            storyId: "s1",
            title: "On S1",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(
      listActiveTicketSummaries(projection, {
        query: { withoutStoryOnly: true },
      }),
    ).toEqual([
      {
        id: "t-orphan",
        title: "No story",
        status: "todo",
        storyId: null,
        ...audit,
      },
    ]);
  });

  it("returns empty when storyId filter matches no tickets", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t-a",
          {
            id: "t-a",
            storyId: "s1",
            title: "On S1",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(
      listActiveTicketSummaries(projection, { storyId: "missing" }),
    ).toEqual([]);
  });

  it("filters by query.statuses in addition to storyId", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t-a",
          {
            id: "t-a",
            storyId: "s1",
            title: "A",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "t-b",
          {
            id: "t-b",
            storyId: "s1",
            title: "B",
            body: "",
            status: "done",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(
      listActiveTicketSummaries(projection, {
        storyId: "s1",
        query: { statuses: ["todo"] },
      }),
    ).toEqual([
      {
        id: "t-a",
        title: "A",
        status: "todo",
        storyId: "s1",
        ...audit,
      },
    ]);
  });

  it("filters by query.epicId using stories projection", () => {
    const projection = projectionWith({
      stories: new Map([
        [
          "s1",
          {
            id: "s1",
            epicId: "e1",
            title: "Story",
            body: "",
            status: "backlog",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
      tickets: new Map([
        [
          "t-a",
          {
            id: "t-a",
            storyId: "s1",
            title: "On epic e1",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
        [
          "t-b",
          {
            id: "t-b",
            storyId: "s-missing",
            title: "Orphan path",
            body: "",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    });
    expect(
      listActiveTicketSummaries(projection, { query: { epicId: "e1" } }),
    ).toEqual([
      {
        id: "t-a",
        title: "On epic e1",
        status: "todo",
        storyId: "s1",
        ...audit,
      },
    ]);
  });

  it("sorts by updatedAt descending when sort options are set", () => {
    // Setup
    const projection = projectionWith({
      tickets: new Map([
        [
          "t-early",
          {
            id: "t-early",
            storyId: "s1",
            title: "Early",
            body: "",
            status: "todo",
            linkedPrs: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: "a",
            updatedAt: "2026-01-01T00:00:00.000Z",
            updatedBy: "a",
            ...statusAudit,
          },
        ],
        [
          "t-late",
          {
            id: "t-late",
            storyId: "s1",
            title: "Late",
            body: "",
            status: "todo",
            linkedPrs: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: "a",
            updatedAt: "2026-06-01T00:00:00.000Z",
            updatedBy: "a",
            ...statusAudit,
          },
        ],
      ]),
    });

    // Act
    const rows = listActiveTicketSummaries(projection, {
      sortBy: "updatedAt",
      sortDir: "desc",
    });

    // Assert
    expect(rows.map((r) => r.id)).toEqual(["t-late", "t-early"]);
  });
});
