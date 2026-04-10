/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import {
  eventTouchesEntityId,
  formatAuditTextLines,
  runAuditOnLines,
} from "./run-audit";
import type { EventLine } from "../storage/event-line";

const baseEvent = (
  partial: Partial<EventLine> & Pick<EventLine, "type">,
): EventLine => ({
  schema: 1,
  id: "e1",
  ts: "2026-01-01T00:00:00.000Z",
  actor: "a",
  payload: {},
  ...partial,
});

describe("eventTouchesEntityId", () => {
  it("matches payload id", () => {
    // Act
    const hit = eventTouchesEntityId(
      baseEvent({ type: "EpicCreated", payload: { id: "abc" } }),
      "abc",
    );

    // Assert
    expect(hit).toBe(true);
  });

  it("matches entityId and ticketId", () => {
    // Act
    const a = eventTouchesEntityId(
      baseEvent({ type: "GithubInboundUpdate", payload: { entityId: "t1" } }),
      "t1",
    );
    const b = eventTouchesEntityId(
      baseEvent({ type: "GithubIssueLinked", payload: { ticketId: "t2" } }),
      "t2",
    );
    const c = eventTouchesEntityId(
      baseEvent({
        type: "GithubPrActivity",
        payload: { ticketId: "t3", prNumber: 1, kind: "opened" },
      }),
      "t3",
    );

    // Assert
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(true);
  });

  it("returns false when no key matches", () => {
    // Act
    const miss = eventTouchesEntityId(
      baseEvent({ type: "EpicCreated", payload: { id: "x" } }),
      "y",
    );

    // Assert
    expect(miss).toBe(false);
  });
});

describe("runAuditOnLines", () => {
  it("parses valid lines and sorts by ts", () => {
    // Setup
    const lines = [
      JSON.stringify(
        baseEvent({
          type: "EpicCreated",
          id: "1",
          ts: "2026-01-02T00:00:00.000Z",
          payload: { id: "ep2" },
        }),
      ),
      "",
      JSON.stringify(
        baseEvent({
          type: "StoryCreated",
          id: "2",
          ts: "2026-01-01T00:00:00.000Z",
          payload: { id: "s1" },
        }),
      ),
    ];

    // Act
    const { events, invalidLines } = runAuditOnLines(lines, {});

    // Assert
    expect(invalidLines).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(["StoryCreated", "EpicCreated"]);
  });

  it("records invalid json and invalid schema lines", () => {
    // Setup
    const lines = ["not-json", JSON.stringify({ foo: 1 })];

    // Act
    const { events, invalidLines } = runAuditOnLines(lines, {});

    // Assert
    expect(events).toEqual([]);
    expect(invalidLines).toHaveLength(2);
    expect(invalidLines[0]?.line).toBe(1);
    expect(invalidLines[1]?.line).toBe(2);
  });

  it("filters by type and entity id", () => {
    // Setup
    const lines = [
      JSON.stringify(
        baseEvent({
          type: "TicketUpdated",
          id: "a",
          ts: "2026-01-01T00:00:00.000Z",
          payload: { id: "t1" },
        }),
      ),
      JSON.stringify(
        baseEvent({
          type: "TicketUpdated",
          id: "b",
          ts: "2026-01-02T00:00:00.000Z",
          payload: { id: "t2" },
        }),
      ),
    ];

    // Act
    const { events } = runAuditOnLines(lines, {
      type: "TicketUpdated",
      entityId: "t2",
    });

    // Assert
    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe("b");
  });

  it("applies limit to the most recent events", () => {
    // Setup
    const lines = [
      JSON.stringify(
        baseEvent({
          type: "EpicCreated",
          id: "1",
          ts: "2026-01-01T00:00:00.000Z",
          payload: { id: "a" },
        }),
      ),
      JSON.stringify(
        baseEvent({
          type: "EpicCreated",
          id: "2",
          ts: "2026-01-03T00:00:00.000Z",
          payload: { id: "b" },
        }),
      ),
      JSON.stringify(
        baseEvent({
          type: "EpicCreated",
          id: "3",
          ts: "2026-01-02T00:00:00.000Z",
          payload: { id: "c" },
        }),
      ),
    ];

    // Act
    const { events } = runAuditOnLines(lines, { limit: 2 });

    // Assert
    expect(events.map((e) => e.id)).toEqual(["3", "2"]);
  });
});

describe("formatAuditTextLines", () => {
  it("joins tab-separated rows", () => {
    // Setup
    const events = [
      baseEvent({
        type: "EpicCreated",
        id: "x",
        ts: "2026-01-01T00:00:00.000Z",
        actor: "cli:u",
        payload: {},
      }),
    ];

    // Act
    const text = formatAuditTextLines(events);

    // Assert
    expect(text).toBe("2026-01-01T00:00:00.000Z\tEpicCreated\tcli:u\tx");
  });

  it("adds ticket, PR, and kind columns for GithubPrActivity", () => {
    const text = formatAuditTextLines([
      baseEvent({
        type: "GithubPrActivity",
        id: "z",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "github:alice",
        payload: {
          ticketId: "tk1",
          prNumber: 44,
          kind: "reviewed",
          sourceId: "github-timeline:1",
          occurredAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ]);
    expect(text).toBe(
      "2026-01-02T00:00:00.000Z\tGithubPrActivity\tgithub:alice\tz\ttk1\t#44\treviewed",
    );
  });
});
