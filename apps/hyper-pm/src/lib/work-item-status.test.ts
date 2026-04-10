/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EPIC_STORY_CREATE_STATUS,
  DEFAULT_TICKET_CREATE_STATUS,
  parseWorkItemStatus,
  resolveStatusForNewEpicStoryPayload,
  resolveStatusForNewTicketPayload,
  resolveTicketInboundStatus,
  resolveTicketStatusFromUpdatePayload,
  statusToGithubIssueState,
  workItemStatusSchema,
} from "./work-item-status";

describe("workItemStatusSchema", () => {
  it("accepts every defined workflow value", () => {
    // Act
    const parsed = workItemStatusSchema.safeParse("in_progress");

    // Assert
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("in_progress");
    }
  });

  it("rejects unknown strings", () => {
    // Act
    const parsed = workItemStatusSchema.safeParse("nope");

    // Assert
    expect(parsed.success).toBe(false);
  });
});

describe("parseWorkItemStatus", () => {
  it("returns undefined for invalid input", () => {
    // Act
    const out = parseWorkItemStatus(123);

    // Assert
    expect(out).toBeUndefined();
  });

  it("returns the status for valid members", () => {
    // Act
    const out = parseWorkItemStatus("cancelled");

    // Assert
    expect(out).toBe("cancelled");
  });
});

describe("resolveStatusForNewEpicStoryPayload", () => {
  it("defaults to backlog when status is absent", () => {
    // Act
    const out = resolveStatusForNewEpicStoryPayload({ id: "e1" });

    // Assert
    expect(out).toBe(DEFAULT_EPIC_STORY_CREATE_STATUS);
  });

  it("uses explicit status when valid", () => {
    // Act
    const out = resolveStatusForNewEpicStoryPayload({
      id: "e1",
      status: "in_progress",
    });

    // Assert
    expect(out).toBe("in_progress");
  });
});

describe("resolveStatusForNewTicketPayload", () => {
  it("defaults to todo when state and status are absent", () => {
    // Act
    const out = resolveStatusForNewTicketPayload({ id: "t1" });

    // Assert
    expect(out).toBe(DEFAULT_TICKET_CREATE_STATUS);
  });

  it("prefers explicit status over legacy state", () => {
    // Act
    const out = resolveStatusForNewTicketPayload({
      id: "t1",
      status: "cancelled",
      state: "open",
    });

    // Assert
    expect(out).toBe("cancelled");
  });

  it("maps legacy closed state to done", () => {
    // Act
    const out = resolveStatusForNewTicketPayload({ id: "t1", state: "closed" });

    // Assert
    expect(out).toBe("done");
  });

  it("maps legacy open state to todo", () => {
    // Act
    const out = resolveStatusForNewTicketPayload({ id: "t1", state: "open" });

    // Assert
    expect(out).toBe("todo");
  });
});

describe("resolveTicketStatusFromUpdatePayload", () => {
  it("returns undefined when no workflow keys are present", () => {
    // Act
    const out = resolveTicketStatusFromUpdatePayload({ id: "t1", title: "x" });

    // Assert
    expect(out).toBeUndefined();
  });

  it("prefers status over legacy state", () => {
    // Act
    const out = resolveTicketStatusFromUpdatePayload({
      id: "t1",
      status: "backlog",
      state: "closed",
    });

    // Assert
    expect(out).toBe("backlog");
  });

  it("maps legacy state closed to done", () => {
    // Act
    const out = resolveTicketStatusFromUpdatePayload({
      id: "t1",
      state: "closed",
    });

    // Assert
    expect(out).toBe("done");
  });

  it("maps legacy state open to todo", () => {
    // Act
    const out = resolveTicketStatusFromUpdatePayload({
      id: "t1",
      state: "open",
    });

    // Assert
    expect(out).toBe("todo");
  });
});

describe("statusToGithubIssueState", () => {
  it("maps terminal statuses to closed", () => {
    // Act
    const done = statusToGithubIssueState("done");
    const cancelled = statusToGithubIssueState("cancelled");

    // Assert
    expect(done).toBe("closed");
    expect(cancelled).toBe("closed");
  });

  it("maps non-terminal statuses to open", () => {
    // Act
    const openish = statusToGithubIssueState("in_progress");

    // Assert
    expect(openish).toBe("open");
  });
});

describe("resolveTicketInboundStatus", () => {
  it("maps closed issues to done", () => {
    // Act
    const out = resolveTicketInboundStatus({
      issueState: "closed",
      currentStatus: "in_progress",
    });

    // Assert
    expect(out).toBe("done");
  });

  it("preserves in_progress when the issue is open", () => {
    // Act
    const out = resolveTicketInboundStatus({
      issueState: "open",
      currentStatus: "in_progress",
    });

    // Assert
    expect(out).toBe("in_progress");
  });

  it("moves done to todo when the issue is reopened", () => {
    // Act
    const out = resolveTicketInboundStatus({
      issueState: "open",
      currentStatus: "done",
    });

    // Assert
    expect(out).toBe("todo");
  });

  it("moves cancelled to todo when the issue is reopened", () => {
    // Act
    const out = resolveTicketInboundStatus({
      issueState: "open",
      currentStatus: "cancelled",
    });

    // Assert
    expect(out).toBe("todo");
  });
});
