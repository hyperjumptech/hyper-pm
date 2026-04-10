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
});
