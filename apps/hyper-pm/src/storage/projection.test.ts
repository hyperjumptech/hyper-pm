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
    expect(epic?.createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(epic?.createdBy).toBe("test");
    expect(epic?.updatedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(epic?.updatedBy).toBe("test");
  });

  it("captures PR refs on tickets", () => {
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
    expect(ticket?.linkedPrs.sort((a: number, b: number) => a - b)).toEqual([
      10, 20,
    ]);
    expect(ticket?.createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.createdBy).toBe("test");
    expect(ticket?.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(ticket?.updatedBy).toBe("test");
  });

  it("advances ticket updated* on GithubIssueLinked", () => {
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
  });
});
