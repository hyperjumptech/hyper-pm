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
        ["b", { id: "b", title: "B", body: "", deleted: true, ...audit }],
        ["a", { id: "a", title: "A", body: "", ...audit }],
        ["c", { id: "c", title: "C", body: "", ...audit }],
      ]),
    });
    expect(listActiveEpicSummaries(projection)).toEqual([
      { id: "a", title: "A", ...audit },
      { id: "c", title: "C", ...audit },
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
            deleted: true,
            ...audit,
          },
        ],
        ["x", { id: "x", epicId: "e1", title: "X", body: "", ...audit }],
      ]),
    });
    expect(listActiveStorySummaries(projection)).toEqual([
      { id: "x", epicId: "e1", title: "X", ...audit },
    ]);
  });
});

describe("listActiveTicketSummaries", () => {
  it("omits deleted tickets and preserves state", () => {
    const projection = projectionWith({
      tickets: new Map([
        [
          "t2",
          {
            id: "t2",
            storyId: "s1",
            title: "Closed",
            body: "",
            state: "closed",
            linkedPrs: [],
            deleted: true,
            ...audit,
          },
        ],
        [
          "t1",
          {
            id: "t1",
            storyId: "s1",
            title: "Open",
            body: "",
            state: "open",
            linkedPrs: [],
            ...audit,
          },
        ],
      ]),
    });
    expect(listActiveTicketSummaries(projection)).toEqual([
      {
        id: "t1",
        title: "Open",
        state: "open",
        storyId: "s1",
        ...audit,
      },
    ]);
  });
});
