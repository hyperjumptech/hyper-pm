/** @vitest-environment node */
import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { buildPrOpenSourceId } from "../lib/github-pr-activity";
import { replayEvents } from "../storage/projection";
import { runGithubPrActivitySync } from "./run-github-pr-activity-sync";

const fullConfig = { sync: "full" } as HyperPmConfig;

describe("runGithubPrActivitySync", () => {
  it("returns early when sync is not full", async () => {
    const appendEvent = vi.fn();
    const out = await runGithubPrActivitySync({
      projection: { epics: new Map(), stories: new Map(), tickets: new Map() },
      config: { sync: "off" } as HyperPmConfig,
      deps: {
        octokit: {} as Octokit,
        owner: "o",
        repo: "r",
        clock: { now: () => new Date("2026-01-01T00:00:00.000Z") },
        actor: "sync-user",
        readEventLines: async () => [],
        appendEvent,
      },
    });
    expect(out).toEqual([]);
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it("appends opened seed and timeline events for in_progress tickets with linked PRs", async () => {
    const pullsGet = vi.fn().mockResolvedValue({
      data: {
        created_at: "2026-01-10T00:00:00Z",
        html_url: "https://github.com/o/r/pull/5",
        user: { login: "dev" },
      },
    });
    const paginate = vi.fn().mockResolvedValue([
      {
        id: 200,
        event: "commented",
        created_at: "2026-01-11T00:00:00Z",
        actor: { login: "reviewer" },
      },
    ]);
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const octokit = {
      rest: {
        pulls: { get: pullsGet },
        issues: { listEventsForTimeline: { endpoint: { merge: vi.fn() } } },
      },
      paginate,
    } as unknown as Octokit;

    const tickets = new Map([
      [
        "t1",
        {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "in_progress" as const,
          linkedPrs: [5],
          createdAt: "a",
          createdBy: "a",
          updatedAt: "a",
          updatedBy: "a",
          statusChangedAt: "a",
          statusChangedBy: "a",
          prActivityRecent: [],
        },
      ],
    ]);

    const out = await runGithubPrActivitySync({
      projection: { epics: new Map(), stories: new Map(), tickets },
      config: fullConfig,
      deps: {
        octokit,
        owner: "o",
        repo: "r",
        clock: { now: () => new Date("2026-01-15T00:00:00.000Z") },
        actor: "sync-user",
        readEventLines: async () => [],
        appendEvent,
      },
    });

    expect(pullsGet).toHaveBeenCalledWith({
      owner: "o",
      repo: "r",
      pull_number: 5,
    });
    expect(paginate).toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe("GithubPrActivity");
    expect(out[0]?.payload["kind"]).toBe("opened");
    expect(out[0]?.payload["sourceId"]).toBe(buildPrOpenSourceId("t1", 5));
    expect(out[1]?.payload["kind"]).toBe("commented");
  });

  it("skips timeline rows already present by sourceId", async () => {
    const pullsGet = vi.fn().mockResolvedValue({
      data: {
        created_at: "2026-01-10T00:00:00Z",
        html_url: "https://github.com/o/r/pull/5",
        user: { login: "dev" },
      },
    });
    const paginate = vi.fn().mockResolvedValue([
      {
        id: 200,
        event: "commented",
        created_at: "2026-01-11T00:00:00Z",
        actor: { login: "reviewer" },
      },
    ]);
    const appendEvent = vi.fn().mockResolvedValue(undefined);
    const octokit = {
      rest: {
        pulls: { get: pullsGet },
        issues: { listEventsForTimeline: { endpoint: { merge: vi.fn() } } },
      },
      paginate,
    } as unknown as Octokit;

    const existingOpen = buildPrOpenSourceId("t1", 5);
    const existingLine = JSON.stringify({
      schema: 1,
      type: "GithubPrActivity",
      id: "old",
      ts: "2026-01-09T00:00:00Z",
      actor: "x",
      payload: {
        ticketId: "t1",
        prNumber: 5,
        kind: "opened",
        sourceId: existingOpen,
        occurredAt: "2026-01-10T00:00:00Z",
      },
    });
    const timelineLine = JSON.stringify({
      schema: 1,
      type: "GithubPrActivity",
      id: "old2",
      ts: "2026-01-11T00:00:00Z",
      actor: "x",
      payload: {
        ticketId: "t1",
        prNumber: 5,
        kind: "commented",
        sourceId: "github-timeline:200",
        occurredAt: "2026-01-11T00:00:00Z",
      },
    });

    const tickets = new Map([
      [
        "t1",
        {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "",
          status: "in_progress" as const,
          linkedPrs: [5],
          createdAt: "a",
          createdBy: "a",
          updatedAt: "a",
          updatedBy: "a",
          statusChangedAt: "a",
          statusChangedBy: "a",
          prActivityRecent: [],
        },
      ],
    ]);

    await runGithubPrActivitySync({
      projection: { epics: new Map(), stories: new Map(), tickets },
      config: fullConfig,
      deps: {
        octokit,
        owner: "o",
        repo: "r",
        clock: { now: () => new Date("2026-01-15T00:00:00.000Z") },
        actor: "sync-user",
        readEventLines: async () => [existingLine, timelineLine],
        appendEvent,
      },
    });

    expect(pullsGet).not.toHaveBeenCalled();
    expect(appendEvent).not.toHaveBeenCalled();
  });
});

describe("runGithubPrActivitySync replay integration", () => {
  it("replay builds prActivityRecent on the ticket", async () => {
    const pullsGet = vi.fn().mockResolvedValue({
      data: {
        created_at: "2026-01-10T00:00:00Z",
        html_url: "https://github.com/o/r/pull/5",
        user: { login: "dev" },
      },
    });
    const paginate = vi.fn().mockResolvedValue([
      {
        id: 200,
        event: "merged",
        created_at: "2026-01-12T00:00:00Z",
        actor: { login: "bot" },
      },
    ]);
    const appended: unknown[] = [];
    const octokit = {
      rest: {
        pulls: { get: pullsGet },
        issues: { listEventsForTimeline: { endpoint: { merge: vi.fn() } } },
      },
      paginate,
    } as unknown as Octokit;

    const baseLines = [
      JSON.stringify({
        schema: 1,
        type: "TicketCreated",
        id: "c1",
        ts: "2026-01-01T00:00:00.000Z",
        actor: "a",
        payload: {
          id: "t1",
          storyId: "s1",
          title: "T",
          body: "Refs #5",
          status: "in_progress",
        },
      }),
    ];

    const proj0 = replayEvents(baseLines);
    const newEvents = await runGithubPrActivitySync({
      projection: proj0,
      config: fullConfig,
      deps: {
        octokit,
        owner: "o",
        repo: "r",
        clock: { now: () => new Date("2026-01-15T00:00:00.000Z") },
        actor: "sync-user",
        readEventLines: async () => baseLines,
        appendEvent: async (evt) => {
          appended.push(evt);
        },
      },
    });

    const allLines = [...baseLines, ...newEvents.map((e) => JSON.stringify(e))];
    const proj = replayEvents(allLines);
    const ticket = proj.tickets.get("t1");
    expect(ticket?.prActivityRecent?.map((x) => x.kind)).toEqual([
      "opened",
      "merged",
    ]);
  });
});
