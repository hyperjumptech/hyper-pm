/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { summarizeAuditEventForWeb } from "./audit-event-summary";

describe("summarizeAuditEventForWeb", () => {
  it("returns unknown for non-objects", () => {
    // Act
    const r = summarizeAuditEventForWeb(null);

    // Assert
    expect(r.title).toBe("Unknown event");
    expect(r.detailLines).toEqual([]);
  });

  it("maps EpicCreated title", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "EpicCreated",
      payload: { id: "e1" },
    });

    // Assert
    expect(r.title).toBe("Epic created");
    expect(r.detailLines).toEqual([]);
  });

  it("describes EpicUpdated status", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "EpicUpdated",
      payload: { id: "e1", status: "done" },
    });

    // Assert
    expect(r.title).toBe("Epic updated");
    expect(r.detailLines).toContain('Status set to "done".');
  });

  it("describes StoryUpdated title and body", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "StoryUpdated",
      payload: { id: "s1", title: "x", body: "y" },
    });

    // Assert
    expect(r.title).toBe("Story updated");
    expect(r.detailLines).toEqual(
      expect.arrayContaining(["Title changed.", "Description updated."]),
    );
  });

  it("describes TicketUpdated assignee and labels", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "TicketUpdated",
      payload: {
        id: "t1",
        assignee: "alice",
        labels: ["a", "b"],
      },
    });

    // Assert
    expect(r.title).toBe("Ticket updated");
    expect(r.detailLines).toContain('Assignee set to "alice".');
    expect(r.detailLines).toContain("Labels: a, b.");
  });

  it("truncates long TicketCommentAdded body", () => {
    // Setup
    const long = `${"word ".repeat(60)}end`;

    // Act
    const r = summarizeAuditEventForWeb({
      type: "TicketCommentAdded",
      payload: { ticketId: "t1", body: long },
    });

    // Assert
    expect(r.title).toBe("Comment added");
    expect(r.detailLines).toHaveLength(1);
    expect(r.detailLines[0]?.endsWith("…")).toBe(true);
    expect(r.detailLines[0]?.length).toBeLessThanOrEqual(200);
  });

  it("formats GithubPrActivity", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "GithubPrActivity",
      payload: { ticketId: "t1", prNumber: 42, kind: "merged" },
    });

    // Assert
    expect(r.title).toBe("Pull request activity");
    expect(r.detailLines).toEqual(["PR #42 · merged"]);
  });

  it("formats GithubIssueLinked", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "GithubIssueLinked",
      payload: { ticketId: "t1", issueNumber: 7 },
    });

    // Assert
    expect(r.title).toBe("GitHub issue linked");
    expect(r.detailLines).toEqual(["Issue #7"]);
  });

  it("formats GithubInboundUpdate field list", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "GithubInboundUpdate",
      payload: { entityId: "t1", title: "x", status: "open" },
    });

    // Assert
    expect(r.title).toBe("GitHub inbound update");
    expect(r.detailLines).toEqual(["Fields: title, status."]);
  });

  it("formats SyncCursor", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "SyncCursor",
      payload: { cursor: "abc" },
    });

    // Assert
    expect(r.title).toBe("Sync cursor");
    expect(r.detailLines).toEqual(["Cursor: abc"]);
  });

  it("uses raw type as title for unrecognized types", () => {
    // Act
    const r = summarizeAuditEventForWeb({
      type: "FutureEventKind",
      payload: {},
    });

    // Assert
    expect(r.title).toBe("FutureEventKind");
  });
});
