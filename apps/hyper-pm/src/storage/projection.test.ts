import { describe, expect, it } from "vitest";
import { GITHUB_PR_ACTIVITY_RECENT_CAP } from "../lib/github-pr-activity";
import { replayEvents } from "./projection";

describe("replayEvents", () => {
  it("applies creates and updates in timestamp order", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "EpicCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "test",
        payload: { id: "epic1", title: "E", body: "" },
      }),
      JSON.stringify({
        schema: 1,
        type: "EpicUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "test",
        payload: { id: "epic1", title: "E2" },
      }),
    ];
    const p = replayEvents(lines);
    const epic = p.epics.get("epic1");
    expect(epic?.title).toBe("E2");
    expect(epic?.status).toBe("backlog");
    expect(epic?.statusChangedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(epic?.statusChangedBy).toBe("test");
    expect(epic?.createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(epic?.createdBy).toBe("test");
    expect(epic?.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(epic?.updatedBy).toBe("test");
  });

  it("captures PR refs on tickets and maps legacy open state to todo", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "test",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "Fixes #10 and Refs #20",
          state: "open",
        },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.status).toBe("todo");
    expect(ticket?.statusChangedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.statusChangedBy).toBe("test");
    expect(ticket?.storyId).toBe("s1");
    expect(ticket?.linkedPrs.sort((a: number, b: number) => a - b)).toEqual([
      10, 20,
    ]);
    expect(ticket?.linkedBranches).toEqual([]);
    expect(ticket?.createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.createdBy).toBe("test");
    expect(ticket?.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.updatedBy).toBe("test");
  });

  it("advances ticket updated* on GithubIssueLinked without changing statusChanged*", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          state: "open",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubIssueLinked",
        id: "e2",
        ts: "2026-01-05T00:00:00.000Z",
        actor: "sync",
        payload: { ticketId: "t1", issueNumber: 99 },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.githubIssueNumber).toBe(99);
    expect(ticket?.createdBy).toBe("a1");
    expect(ticket?.updatedAt).toBe("2026-01-05T00:00:00.000Z");
    expect(ticket?.updatedBy).toBe("sync");
    expect(ticket?.statusChangedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.statusChangedBy).toBe("a1");
  });

  it("bumps statusChanged* only when ticket status changes", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "a2",
        payload: { id: "t1", title: "T2" },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e3",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "a3",
        payload: { id: "t1", status: "done" },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.title).toBe("T2");
    expect(ticket?.status).toBe("done");
    expect(ticket?.statusChangedAt).toBe("2026-01-04T00:00:00.000Z");
    expect(ticket?.statusChangedBy).toBe("a3");
    expect(ticket?.updatedAt).toBe("2026-01-04T00:00:00.000Z");
    expect(ticket?.updatedBy).toBe("a3");
  });

  it("preserves in_progress on legacy inbound open state", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "in_progress",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubInboundUpdate",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh",
        payload: {
          entity: "ticket",
          entityId: "t1",
          title: "T",
          body: "",
          state: "open",
        },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.status).toBe("in_progress");
    expect(ticket?.statusChangedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.statusChangedBy).toBe("a1");
  });

  it("applies explicit inbound status from payload", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "in_progress",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubInboundUpdate",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh",
        payload: {
          entity: "ticket",
          entityId: "t1",
          title: "T",
          body: "",
          status: "done",
        },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.status).toBe("done");
    expect(ticket?.statusChangedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(ticket?.statusChangedBy).toBe("gh");
  });

  it("appends GithubPrActivity to prActivityRecent without changing status", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "in_progress",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubPrActivity",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh:u",
        payload: {
          ticketId: "t1",
          prNumber: 9,
          kind: "commented",
          sourceId: "github-timeline:1",
          occurredAt: "2026-01-03T00:00:00.000Z",
        },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.status).toBe("in_progress");
    expect(ticket?.prActivityRecent).toEqual([
      {
        prNumber: 9,
        kind: "commented",
        occurredAt: "2026-01-03T00:00:00.000Z",
        sourceId: "github-timeline:1",
      },
    ]);
  });

  it("caps prActivityRecent at GITHUB_PR_ACTIVITY_RECENT_CAP", () => {
    const lines: string[] = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e0",
        ts: "2026-01-01T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "in_progress",
        },
      }),
    ];
    for (let i = 0; i < GITHUB_PR_ACTIVITY_RECENT_CAP + 5; i++) {
      lines.push(
        JSON.stringify({
          schema: 1,
          type: "GithubPrActivity",
          id: `e${i + 1}`,
          ts: `2026-01-02T00:00:${String(i).padStart(2, "0")}.000Z`,
          actor: "x",
          payload: {
            ticketId: "t1",
            prNumber: 1,
            kind: "updated",
            sourceId: `github-timeline:${i}`,
            occurredAt: `2026-01-02T00:00:${String(i).padStart(2, "0")}.000Z`,
          },
        }),
      );
    }
    const p = replayEvents(lines);
    expect(p.tickets.get("t1")?.prActivityRecent?.length).toBe(
      GITHUB_PR_ACTIVITY_RECENT_CAP,
    );
  });

  it("creates ticket without story when storyId is omitted, null, empty, or non-string", () => {
    const omitStory = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t-omit",
          title: "Orphan",
          body: "",
          status: "todo",
        },
      }),
    ];
    expect(replayEvents(omitStory).tickets.get("t-omit")?.storyId).toBeNull();

    const nullStory = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t-null",
          storyId: null,
          title: "Orphan",
          body: "",
          status: "todo",
        },
      }),
    ];
    expect(replayEvents(nullStory).tickets.get("t-null")?.storyId).toBeNull();

    const emptyStory = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t-empty",
          storyId: "",
          title: "Orphan",
          body: "",
          status: "todo",
        },
      }),
    ];
    expect(replayEvents(emptyStory).tickets.get("t-empty")?.storyId).toBeNull();

    const badType = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t-bad",
          storyId: 42,
          title: "Orphan",
          body: "",
          status: "todo",
        },
      }),
    ];
    expect(replayEvents(badType).tickets.get("t-bad")?.storyId).toBeNull();
  });

  it("trims storyId on TicketCreated when string", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          storyId: "  s1  ",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
    ];
    expect(replayEvents(lines).tickets.get("t1")?.storyId).toBe("s1");
  });

  it("links and unlinks story via TicketUpdated and ignores non-string storyId", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", storyId: "s1" },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e3",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "c",
        payload: { id: "t1", storyId: null },
      }),
    ];
    const p = replayEvents(lines);
    expect(p.tickets.get("t1")?.storyId).toBeNull();
    expect(p.tickets.get("t1")?.updatedBy).toBe("c");

    const ignoreBad = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t2",
          storyId: "s1",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t2", storyId: 99 },
      }),
    ];
    expect(replayEvents(ignoreBad).tickets.get("t2")?.storyId).toBe("s1");
  });

  it("sets normalized assignee on TicketCreated and ignores non-string assignee", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "todo",
          assignee: "  Pat  ",
        },
      }),
    ];
    const p = replayEvents(lines);
    expect(p.tickets.get("t1")?.assignee).toBe("pat");

    const linesBad = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t2",
          storyId: "s1",
          title: "T",
          body: "",
          status: "todo",
          assignee: 99,
        },
      }),
    ];
    const p2 = replayEvents(linesBad);
    expect(p2.tickets.get("t2")?.assignee).toBeUndefined();
  });

  it("patches and clears assignee via TicketUpdated", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", assignee: "sam" },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e3",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "c",
        payload: { id: "t1", assignee: null },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.assignee).toBeUndefined();
    expect(ticket?.updatedBy).toBe("c");
  });

  it("applies assignee from GithubInboundUpdate", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "todo",
          assignee: "old",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubInboundUpdate",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh:bot",
        payload: {
          entity: "ticket",
          entityId: "t1",
          title: "T",
          body: "",
          status: "todo",
          assignee: "new",
        },
      }),
    ];
    const p = replayEvents(lines);
    expect(p.tickets.get("t1")?.assignee).toBe("new");
  });

  it("sets linkedBranches on TicketCreated and replaces via TicketUpdated", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          branches: ["  feature/a  ", "refs/heads/feature/b", "feature/a"],
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", branches: ["main"] },
      }),
    ];
    const p = replayEvents(lines);
    expect(p.tickets.get("t1")?.linkedBranches).toEqual(["main"]);
  });

  it("leaves linkedBranches unchanged on GithubInboundUpdate", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "hello",
          status: "todo",
          branches: ["work/x"],
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubInboundUpdate",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh",
        payload: {
          entity: "ticket",
          entityId: "t1",
          title: "T2",
          body: "patched",
        },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.linkedBranches).toEqual(["work/x"]);
    expect(ticket?.body).toBe("patched");
  });

  it("applies labels and planning fields from GithubInboundUpdate", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "hello",
          status: "todo",
          labels: ["old"],
          priority: "low",
          estimate: 1,
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubInboundUpdate",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh",
        payload: {
          entity: "ticket",
          entityId: "t1",
          labels: ["from-gh"],
          priority: "urgent",
          estimate: 5,
        },
      }),
    ];
    const t = replayEvents(lines).tickets.get("t1");
    expect(t?.labels).toEqual(["from-gh"]);
    expect(t?.priority).toBe("urgent");
    expect(t?.estimate).toBe(5);
  });

  it("ignores TicketUpdated branches payload when value is not an array", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          branches: ["keep"],
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", branches: "not-an-array" },
      }),
    ];
    expect(replayEvents(lines).tickets.get("t1")?.linkedBranches).toEqual([
      "keep",
    ]);
  });

  it("appends TicketCommentAdded in replay order and bumps updated*", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a1",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketCommentAdded",
        id: "c1",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "bob",
        payload: { ticketId: "t1", body: "first" },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketCommentAdded",
        id: "c2",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "carol",
        payload: { ticketId: "t1", body: "second" },
      }),
    ];
    const p = replayEvents(lines);
    const ticket = p.tickets.get("t1");
    expect(ticket?.comments).toEqual([
      {
        id: "c1",
        body: "first",
        createdAt: "2026-01-03T00:00:00.000Z",
        createdBy: "bob",
      },
      {
        id: "c2",
        body: "second",
        createdAt: "2026-01-04T00:00:00.000Z",
        createdBy: "carol",
      },
    ]);
    expect(ticket?.updatedAt).toBe("2026-01-04T00:00:00.000Z");
    expect(ticket?.updatedBy).toBe("carol");
    expect(ticket?.statusChangedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("ignores TicketCommentAdded when ticket is missing or deleted", () => {
    const unknownOnly = [
      JSON.stringify({
        schema: 1,
        type: "TicketCommentAdded",
        id: "c0",
        ts: "2026-01-01T00:00:00.000Z",
        actor: "x",
        payload: { ticketId: "missing", body: "orphan" },
      }),
    ];
    expect(replayEvents(unknownOnly).tickets.size).toBe(0);

    const afterDelete = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: { id: "t1", title: "T", body: "", status: "todo" },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketDeleted",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "a",
        payload: { id: "t1" },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketCommentAdded",
        id: "c1",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "a",
        payload: { ticketId: "t1", body: "late" },
      }),
    ];
    const p = replayEvents(afterDelete);
    expect(p.tickets.get("t1")?.deleted).toBe(true);
    expect(p.tickets.get("t1")?.comments).toBeUndefined();
  });

  it("applies planning fields on TicketCreated when valid", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          labels: ["x", "x", " y "],
          priority: "high",
          size: "m",
          estimate: 5,
          startWorkAt: "2026-02-01T00:00:00.000Z",
          targetFinishAt: "2026-02-10T00:00:00.000Z",
        },
      }),
    ];
    const t = replayEvents(lines).tickets.get("t1");
    expect(t?.labels).toEqual(["x", "y"]);
    expect(t?.priority).toBe("high");
    expect(t?.size).toBe("m");
    expect(t?.estimate).toBe(5);
    expect(t?.startWorkAt).toBe("2026-02-01T00:00:00.000Z");
    expect(t?.targetFinishAt).toBe("2026-02-10T00:00:00.000Z");
  });

  it("omits labels on TicketCreated when labels array is empty", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          labels: [],
        },
      }),
    ];
    const t = replayEvents(lines).tickets.get("t1");
    expect(t?.labels).toBeUndefined();
  });

  it("patches and clears planning fields via TicketUpdated", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          labels: ["a"],
          priority: "low",
          size: "s",
          estimate: 1,
          startWorkAt: "2026-03-01T00:00:00.000Z",
          targetFinishAt: "2026-03-05T00:00:00.000Z",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: {
          id: "t1",
          labels: ["b"],
          priority: "urgent",
          size: "xl",
          estimate: 8,
          startWorkAt: "2026-04-01T00:00:00.000Z",
          targetFinishAt: "2026-04-15T00:00:00.000Z",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e3",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "c",
        payload: {
          id: "t1",
          labels: null,
          priority: null,
          size: null,
          estimate: null,
          startWorkAt: null,
          targetFinishAt: null,
        },
      }),
    ];
    const t = replayEvents(lines).tickets.get("t1");
    expect(t?.labels).toBeUndefined();
    expect(t?.priority).toBeUndefined();
    expect(t?.size).toBeUndefined();
    expect(t?.estimate).toBeUndefined();
    expect(t?.startWorkAt).toBeUndefined();
    expect(t?.targetFinishAt).toBeUndefined();
  });

  it("clears labels when TicketUpdated sends empty labels array", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          labels: ["z"],
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", labels: [] },
      }),
    ];
    expect(replayEvents(lines).tickets.get("t1")?.labels).toBeUndefined();
  });

  it("applies dependsOn on TicketCreated when valid", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          dependsOn: ["x", " x "],
        },
      }),
    ];
    const t = replayEvents(lines).tickets.get("t1");
    expect(t?.dependsOn).toEqual(["x"]);
  });

  it("ignores invalid dependsOn on TicketCreated", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          dependsOn: ["a", 1],
        },
      }),
    ];
    expect(replayEvents(lines).tickets.get("t1")?.dependsOn).toBeUndefined();
  });

  it("patches and clears dependsOn via TicketUpdated", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          dependsOn: ["a"],
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", dependsOn: ["b", "c"] },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e3",
        ts: "2026-01-04T00:00:00.000Z",
        actor: "c",
        payload: { id: "t1", dependsOn: null },
      }),
    ];
    const t = replayEvents(lines).tickets.get("t1");
    expect(t?.dependsOn).toBeUndefined();
  });

  it("clears dependsOn when TicketUpdated sends empty dependsOn array", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
          dependsOn: ["z"],
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "TicketUpdated",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "b",
        payload: { id: "t1", dependsOn: [] },
      }),
    ];
    expect(replayEvents(lines).tickets.get("t1")?.dependsOn).toBeUndefined();
  });

  it("applies dependsOn from GithubInboundUpdate", () => {
    const lines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "e1",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          title: "T",
          body: "",
          status: "todo",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubInboundUpdate",
        id: "e2",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "gh",
        payload: {
          entity: "ticket",
          entityId: "t1",
          dependsOn: ["d1", "d2"],
        },
      }),
    ];
    expect(replayEvents(lines).tickets.get("t1")?.dependsOn).toEqual([
      "d1",
      "d2",
    ]);
  });
});
