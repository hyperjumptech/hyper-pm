/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  buildPrOpenedPayloadFromPull,
  mapGithubTimelineItemToActivityPayload,
} from "./map-github-timeline-to-activity";

describe("mapGithubTimelineItemToActivityPayload", () => {
  it("maps commented events", () => {
    const out = mapGithubTimelineItemToActivityPayload(
      {
        id: 1001,
        event: "commented",
        created_at: "2026-02-01T12:00:00Z",
        actor: { login: "alice" },
        url: "https://api.github.com/repos/o/r/issues/comments/1",
      },
      "ticket-a",
      55,
    );
    expect(out).toEqual({
      ticketId: "ticket-a",
      prNumber: 55,
      kind: "commented",
      sourceId: "github-timeline:1001",
      occurredAt: "2026-02-01T12:00:00Z",
      url: "https://api.github.com/repos/o/r/issues/comments/1",
    });
  });

  it("maps reviewed with normalized state", () => {
    const out = mapGithubTimelineItemToActivityPayload(
      {
        id: 1002,
        event: "reviewed",
        state: "APPROVED",
        created_at: "2026-02-02T12:00:00Z",
        actor: { login: "bob" },
      },
      "ticket-a",
      55,
    );
    expect(out).toEqual({
      ticketId: "ticket-a",
      prNumber: 55,
      kind: "reviewed",
      sourceId: "github-timeline:1002",
      occurredAt: "2026-02-02T12:00:00Z",
      reviewState: "approved",
    });
  });

  it("maps head_ref_force_pushed to updated", () => {
    const out = mapGithubTimelineItemToActivityPayload(
      {
        id: 1003,
        event: "head_ref_force_pushed",
        created_at: "2026-02-03T12:00:00Z",
      },
      "t1",
      3,
    );
    expect(out?.kind).toBe("updated");
  });

  it("returns null when id is missing", () => {
    expect(
      mapGithubTimelineItemToActivityPayload(
        { event: "commented", created_at: "2026-01-01T00:00:00Z" },
        "t1",
        1,
      ),
    ).toBeNull();
  });

  it("returns null for unsupported timeline events", () => {
    expect(
      mapGithubTimelineItemToActivityPayload(
        {
          id: 9,
          event: "labeled",
          created_at: "2026-01-01T00:00:00Z",
        },
        "t1",
        1,
      ),
    ).toBeNull();
  });
});

describe("buildPrOpenedPayloadFromPull", () => {
  it("builds opened fields", () => {
    expect(
      buildPrOpenedPayloadFromPull({
        ticketId: "t9",
        prNumber: 8,
        createdAt: "2026-03-01T00:00:00Z",
        sourceId: "hyper-pm:pr-open:t9:8",
        url: "https://github.com/o/r/pull/8",
      }),
    ).toEqual({
      ticketId: "t9",
      prNumber: 8,
      kind: "opened",
      sourceId: "hyper-pm:pr-open:t9:8",
      occurredAt: "2026-03-01T00:00:00Z",
      url: "https://github.com/o/r/pull/8",
    });
  });
});
