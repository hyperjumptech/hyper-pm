import { describe, expect, it } from "vitest";
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
    expect(ticket?.linkedPrs.sort((a: number, b: number) => a - b)).toEqual([
      10, 20,
    ]);
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
});
