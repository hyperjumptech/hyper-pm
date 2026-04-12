import { describe, expect, it } from "vitest";
import type { TicketRecord } from "../storage/projection";
import {
  isNoOpUpdatePayload,
  pruneEpicOrStoryUpdatePayloadAgainstRow,
  pruneTicketUpdatePayloadAgainstRow,
} from "./prune-unchanged-work-item-update-payload";

/** Minimal ticket row for pruning tests (only fields read by the pruner are meaningful). */
const ticketFixture = (over: Partial<TicketRecord>): TicketRecord =>
  ({
    id: "t1",
    number: 1,
    storyId: null,
    title: "Title",
    body: "Body",
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

describe("pruneEpicOrStoryUpdatePayloadAgainstRow", () => {
  it("keeps only fields that differ from the current row", () => {
    // Setup
    const cur = { title: "A", body: "b", status: "backlog" as const };
    const draft = {
      id: "x",
      title: "A",
      body: "new",
      status: "backlog",
    };

    // Act
    const out = pruneEpicOrStoryUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "x", body: "new" });
  });

  it("returns only id when nothing changes", () => {
    // Setup
    const cur = { title: "A", body: "b", status: "done" as const };
    const draft = { id: "x", title: "A", body: "b", status: "done" };

    // Act
    const out = pruneEpicOrStoryUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "x" });
  });
});

describe("pruneTicketUpdatePayloadAgainstRow", () => {
  it("drops title and status when only body changes", () => {
    // Setup
    const cur = ticketFixture({
      title: "Same",
      body: "old",
      status: "todo",
    });
    const draft = {
      id: "t1",
      title: "Same",
      body: "new",
      status: "todo",
    };

    // Act
    const out = pruneTicketUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "t1", body: "new" });
  });

  it("keeps storyId when linking changes", () => {
    // Setup
    const cur = ticketFixture({ storyId: null });
    const draft = { id: "t1", storyId: "s9" };

    // Act
    const out = pruneTicketUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "t1", storyId: "s9" });
  });

  it("omits storyId when it matches the current link", () => {
    // Setup
    const cur = ticketFixture({ storyId: "s1" });
    const draft = { id: "t1", storyId: "s1" };

    // Act
    const out = pruneTicketUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "t1" });
  });

  it("keeps dependsOn when the list changes", () => {
    // Setup
    const cur = ticketFixture({ dependsOn: ["a"] });
    const draft = { id: "t1", dependsOn: ["a", "b"] };

    // Act
    const out = pruneTicketUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "t1", dependsOn: ["a", "b"] });
  });

  it("emits dependsOn null when clearing existing dependencies", () => {
    // Setup
    const cur = ticketFixture({ dependsOn: ["x"] });
    const draft = { id: "t1", dependsOn: null };

    // Act
    const out = pruneTicketUpdatePayloadAgainstRow(cur, draft);

    // Assert
    expect(out).toEqual({ id: "t1", dependsOn: null });
  });
});

describe("isNoOpUpdatePayload", () => {
  it("is true only for a lone id key", () => {
    // Act
    const a = isNoOpUpdatePayload({ id: "x" });
    const b = isNoOpUpdatePayload({ id: "x", body: "y" });

    // Assert
    expect(a).toBe(true);
    expect(b).toBe(false);
  });
});
