/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../storage/append-event", () => ({
  appendEventLine: vi.fn().mockResolvedValue("events/2026/01/x.jsonl"),
}));

import type { Octokit } from "@octokit/rest";
import type { HyperPmConfig } from "../config/hyper-pm-config";
import { buildGithubIssueBody } from "../lib/github-issue-body";
import type { Projection } from "../storage/projection";
import { appendEventLine } from "../storage/append-event";
import { runGithubInboundSync, runGithubOutboundSync } from "./run-github-sync";

const audit = {
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "a",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "a",
} as const;

const statusAudit = {
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  statusChangedBy: "a",
} as const;

const baseConfig: HyperPmConfig = {
  schema: 1,
  dataBranch: "hyper-pm-data",
  remote: "origin",
  sync: "full",
  issueMapping: "ticket",
};

const epicStory = (): Pick<Projection, "epics" | "stories"> => ({
  epics: new Map([
    [
      "e1",
      {
        id: "e1",
        title: "Epic",
        body: "",
        status: "backlog",
        ...audit,
        ...statusAudit,
      },
    ],
  ]),
  stories: new Map([
    [
      "s1",
      {
        id: "s1",
        epicId: "e1",
        title: "Story",
        body: "",
        status: "backlog",
        ...audit,
        ...statusAudit,
      },
    ],
  ]),
});

describe("runGithubOutboundSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.mocked(appendEventLine).mockClear();
  });

  it("passes assignees on issues.update when the ticket has an assignee", async () => {
    // Setup
    const issuesUpdate = vi.fn().mockResolvedValue({ data: {} });
    const octokit = {
      rest: {
        issues: {
          update: issuesUpdate,
          create: vi.fn(),
          listForRepo: vi.fn(),
        },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;
    const projection: Projection = {
      ...epicStory(),
      tickets: new Map([
        [
          "t1",
          {
            id: "t1",
            storyId: "s1",
            title: "Task",
            body: "hello",
            status: "todo",
            linkedPrs: [],
            githubIssueNumber: 5,
            assignee: "alice",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    };
    const clock = { now: () => new Date("2026-02-01T00:00:00.000Z") };

    // Act
    await runGithubOutboundSync({
      dataRoot: "/tmp/hyper-pm-test",
      projection,
      config: baseConfig,
      deps: {
        octokit,
        owner: "acme",
        repo: "app",
        clock,
        outboundActor: "github:tester",
      },
    });

    // Assert
    expect(issuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "app",
        issue_number: 5,
        assignees: ["alice"],
      }),
    );
  });

  it("passes assignees on issues.create for new linked issues", async () => {
    // Setup
    const issuesCreate = vi
      .fn()
      .mockResolvedValue({ data: { number: 99, id: 1 } });
    const octokit = {
      rest: {
        issues: {
          update: vi.fn(),
          create: issuesCreate,
          listForRepo: vi.fn(),
        },
      },
      paginate: vi.fn(),
    } as unknown as Octokit;
    const projection: Projection = {
      ...epicStory(),
      tickets: new Map([
        [
          "t-new",
          {
            id: "t-new",
            storyId: "s1",
            title: "New ticket",
            body: "desc",
            status: "todo",
            linkedPrs: [],
            assignee: "bob",
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    };
    const clock = { now: () => new Date("2026-02-02T00:00:00.000Z") };

    // Act
    await runGithubOutboundSync({
      dataRoot: "/tmp/hyper-pm-test",
      projection,
      config: baseConfig,
      deps: {
        octokit,
        owner: "acme",
        repo: "app",
        clock,
        outboundActor: "github:tester",
      },
    });

    // Assert
    expect(issuesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        assignees: ["bob"],
      }),
    );
  });
});

describe("runGithubInboundSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.mocked(appendEventLine).mockClear();
  });

  it("appends GithubInboundUpdate when GitHub assignee differs from projection", async () => {
    // Setup
    const body = buildGithubIssueBody({
      hyperPmId: "t1",
      type: "ticket",
      parentIds: { epic: "e1", story: "s1" },
      description: "hello",
    });
    const paginate = vi.fn().mockResolvedValue([
      {
        id: 501,
        body,
        title: "[hyper-pm] My ticket",
        state: "open",
        user: { login: "author" },
        assignees: [{ login: "Carol" }],
      },
    ]);
    const octokit = {
      rest: {
        issues: {
          update: vi.fn(),
          create: vi.fn(),
          listForRepo: vi.fn(),
        },
      },
      paginate,
    } as unknown as Octokit;
    const projection: Projection = {
      ...epicStory(),
      tickets: new Map([
        [
          "t1",
          {
            id: "t1",
            storyId: "s1",
            title: "My ticket",
            body: "hello",
            status: "todo",
            linkedPrs: [],
            ...audit,
            ...statusAudit,
          },
        ],
      ]),
    };
    const clock = { now: () => new Date("2026-03-01T00:00:00.000Z") };

    // Act
    await runGithubInboundSync({
      dataRoot: "/tmp/hyper-pm-in",
      projection,
      config: baseConfig,
      deps: {
        octokit,
        owner: "acme",
        repo: "app",
        clock,
      },
    });

    // Assert
    expect(appendEventLine).toHaveBeenCalled();
    const inboundCalls = vi
      .mocked(appendEventLine)
      .mock.calls.filter(
        (c) => (c[1] as { type?: string }).type === "GithubInboundUpdate",
      );
    expect(inboundCalls.length).toBe(1);
    expect(inboundCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        type: "GithubInboundUpdate",
        payload: expect.objectContaining({
          entity: "ticket",
          entityId: "t1",
          assignee: "carol",
        }),
      }),
    );
  });
});
