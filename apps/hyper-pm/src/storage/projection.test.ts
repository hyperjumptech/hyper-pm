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
});
