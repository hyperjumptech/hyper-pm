/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { collectGithubPrActivitySourceIdsFromLines } from "./collect-github-pr-activity-source-ids";

describe("collectGithubPrActivitySourceIdsFromLines", () => {
  it("collects sourceId from GithubPrActivity lines and skips others", () => {
    const lines = [
      "",
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "a",
        ts: "2026-01-01T00:00:00.000Z",
        actor: "x",
        payload: { id: "t1" },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubPrActivity",
        id: "b",
        ts: "2026-01-02T00:00:00.000Z",
        actor: "y",
        payload: {
          ticketId: "t1",
          prNumber: 1,
          kind: "opened",
          sourceId: "hyper-pm:pr-open:t1:1",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      JSON.stringify({
        schema: 1,
        type: "GithubPrActivity",
        id: "c",
        ts: "2026-01-03T00:00:00.000Z",
        actor: "y",
        payload: {
          ticketId: "t1",
          prNumber: 1,
          kind: "commented",
          sourceId: "github-timeline:42",
          occurredAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ];
    const set = collectGithubPrActivitySourceIdsFromLines(lines);
    expect([...set].sort()).toEqual([
      "github-timeline:42",
      "hyper-pm:pr-open:t1:1",
    ]);
  });

  it("ignores invalid JSON lines", () => {
    const set = collectGithubPrActivitySourceIdsFromLines(["not-json"]);
    expect(set.size).toBe(0);
  });
});
