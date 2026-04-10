/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  buildPrOpenSourceId,
  parseGithubPrActivityPayload,
} from "./github-pr-activity";

describe("buildPrOpenSourceId", () => {
  it("returns a stable hyper-pm scoped id", () => {
    expect(buildPrOpenSourceId("tick1", 42)).toBe("hyper-pm:pr-open:tick1:42");
  });
});

describe("parseGithubPrActivityPayload", () => {
  it("parses a complete payload", () => {
    const out = parseGithubPrActivityPayload({
      ticketId: "t1",
      prNumber: 7,
      kind: "reviewed",
      sourceId: "github-timeline:99",
      occurredAt: "2026-01-02T00:00:00.000Z",
      reviewState: "approved",
      url: "https://github.com/o/r/pull/7",
    });
    expect(out).toEqual({
      prNumber: 7,
      kind: "reviewed",
      occurredAt: "2026-01-02T00:00:00.000Z",
      sourceId: "github-timeline:99",
      reviewState: "approved",
      url: "https://github.com/o/r/pull/7",
    });
  });

  it("returns undefined when kind is invalid", () => {
    expect(
      parseGithubPrActivityPayload({
        ticketId: "t1",
        prNumber: 1,
        kind: "nope",
        sourceId: "x",
        occurredAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when required strings are missing", () => {
    expect(
      parseGithubPrActivityPayload({
        prNumber: 1,
        kind: "opened",
        sourceId: "x",
      }),
    ).toBeUndefined();
  });

  it("accepts numeric prNumber as string", () => {
    const out = parseGithubPrActivityPayload({
      ticketId: "t1",
      prNumber: "12",
      kind: "merged",
      sourceId: "s",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });
    expect(out?.prNumber).toBe(12);
  });
});
