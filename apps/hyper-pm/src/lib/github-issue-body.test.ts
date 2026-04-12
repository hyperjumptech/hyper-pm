/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  buildGithubIssueBody,
  extractDescriptionBeforeFirstFence,
  inboundTicketPlanningPayloadFromFenceMeta,
  parseHyperPmFenceObject,
  parseHyperPmIdFromIssueBody,
  ticketPlanningForGithubIssueBody,
} from "./github-issue-body";
import type { TicketRecord } from "../storage/projection";

const baseTicket = (): TicketRecord => ({
  id: "t1",
  storyId: null,
  title: "T",
  body: "",
  status: "todo",
  linkedPrs: [],
  linkedBranches: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "a",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "a",
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  statusChangedBy: "a",
});

describe("github-issue-body", () => {
  it("round-trips hyper_pm_id in a fence", () => {
    const body = buildGithubIssueBody({
      hyperPmId: "01",
      type: "ticket",
      parentIds: { story: "s1" },
      description: "Hello",
    });
    expect(parseHyperPmIdFromIssueBody(body)).toBe("01");
  });

  it("embeds ticket planning in the fence when type is ticket", () => {
    const body = buildGithubIssueBody({
      hyperPmId: "t1",
      type: "ticket",
      parentIds: {},
      description: "Desc",
      ticketPlanning: {
        priority: "high",
        size: "m",
        estimate: 3,
        startWorkAt: "2026-02-01T00:00:00.000Z",
        targetFinishAt: "2026-02-10T00:00:00.000Z",
      },
    });
    const meta = parseHyperPmFenceObject(body);
    expect(meta).toMatchObject({
      hyper_pm_id: "t1",
      priority: "high",
      size: "m",
      estimate: 3,
      start_work_at: "2026-02-01T00:00:00.000Z",
      target_finish_at: "2026-02-10T00:00:00.000Z",
    });
  });

  it("does not embed planning for non-ticket types even if passed", () => {
    const body = buildGithubIssueBody({
      hyperPmId: "e1",
      type: "epic",
      parentIds: {},
      description: "E",
      ticketPlanning: {
        priority: "low",
      },
    });
    expect(parseHyperPmFenceObject(body)).not.toHaveProperty("priority");
  });

  it("parseHyperPmFenceObject returns undefined for invalid JSON", () => {
    expect(parseHyperPmFenceObject("```json\nnot json\n```")).toBeUndefined();
    expect(parseHyperPmFenceObject("no fence")).toBeUndefined();
  });

  it("extractDescriptionBeforeFirstFence trims before first fence", () => {
    const body = "Line one\n\n```json\n{}\n```";
    expect(extractDescriptionBeforeFirstFence(body)).toBe("Line one");
  });

  it("inboundTicketPlanningPayloadFromFenceMeta maps snake_case and null", () => {
    const patch = inboundTicketPlanningPayloadFromFenceMeta({
      priority: "medium",
      size: "xl",
      estimate: 2,
      start_work_at: "2026-03-01T00:00:00.000Z",
      target_finish_at: "2026-03-02T00:00:00.000Z",
    });
    expect(patch).toEqual({
      priority: "medium",
      size: "xl",
      estimate: 2,
      startWorkAt: "2026-03-01T00:00:00.000Z",
      targetFinishAt: "2026-03-02T00:00:00.000Z",
    });

    const cleared = inboundTicketPlanningPayloadFromFenceMeta({
      priority: null,
      estimate: null,
    });
    expect(cleared).toEqual({ priority: null, estimate: null });
  });

  it("inboundTicketPlanningPayloadFromFenceMeta ignores invalid values", () => {
    const patch = inboundTicketPlanningPayloadFromFenceMeta({
      priority: "nope",
      estimate: -1,
      start_work_at: "not-a-date",
    });
    expect(patch).toEqual({});
  });

  it("ticketPlanningForGithubIssueBody returns undefined when no planning set", () => {
    expect(ticketPlanningForGithubIssueBody(baseTicket())).toBeUndefined();
  });

  it("ticketPlanningForGithubIssueBody copies set planning fields", () => {
    const t = baseTicket();
    t.priority = "urgent";
    t.estimate = 1;
    expect(ticketPlanningForGithubIssueBody(t)).toEqual({
      priority: "urgent",
      estimate: 1,
    });
  });
});
