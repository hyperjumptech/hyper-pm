/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import type { EventLine } from "../storage/event-line";
import {
  AUDIT_TEXT_STYLES,
  buildAuditLinkMetadata,
  formatAuditHumanSentence,
  formatAuditPlainLines,
  githubIssueHtmlUrl,
  githubPullHtmlUrl,
  parseAuditTextStyle,
} from "./format-audit-plain-lines";

const repo = { owner: "acme", repo: "demo" };

const base = (
  partial: Partial<EventLine> & Pick<EventLine, "type">,
): EventLine => ({
  schema: 1,
  id: "evt-1",
  ts: "2026-01-01T12:00:00.000Z",
  actor: "cli:tester",
  payload: {},
  ...partial,
});

describe("AUDIT_TEXT_STYLES", () => {
  it("lists the three CLI styles", () => {
    // Assert
    expect(AUDIT_TEXT_STYLES).toEqual(["tsv", "plain", "plain-links"]);
  });
});

describe("parseAuditTextStyle", () => {
  it("defaults undefined or empty to tsv", () => {
    // Act
    const a = parseAuditTextStyle(undefined);
    const b = parseAuditTextStyle("");

    // Assert
    expect(a).toBe("tsv");
    expect(b).toBe("tsv");
  });

  it("accepts plain and plain-links", () => {
    // Act
    expect(parseAuditTextStyle("plain")).toBe("plain");
    expect(parseAuditTextStyle("plain-links")).toBe("plain-links");
    expect(parseAuditTextStyle("tsv")).toBe("tsv");
  });

  it("returns undefined for unknown values", () => {
    // Act
    const out = parseAuditTextStyle("nope");

    // Assert
    expect(out).toBeUndefined();
  });
});

describe("githubIssueHtmlUrl / githubPullHtmlUrl", () => {
  it("builds canonical GitHub URLs", () => {
    // Act
    const issue = githubIssueHtmlUrl("a c", "r_x", 12);
    const pr = githubPullHtmlUrl("a c", "r_x", 12);

    // Assert
    expect(issue).toBe("https://github.com/a%20c/r_x/issues/12");
    expect(pr).toBe("https://github.com/a%20c/r_x/pull/12");
  });
});

describe("formatAuditHumanSentence", () => {
  it("describes TicketUpdated status without embedding body text", () => {
    // Setup
    const evt = base({
      type: "TicketUpdated",
      payload: {
        id: "t1",
        status: "todo",
        body: "SECRET_BODY_CONTENT_SHOULD_NOT_APPEAR",
      },
    });

    // Act
    const line = formatAuditHumanSentence(evt);

    // Assert
    expect(line).toContain('"todo"');
    expect(line).not.toContain("SECRET_BODY");
    expect(line).toMatch(/updated the description/);
  });

  it("does not embed title text on TicketUpdated", () => {
    // Setup
    const evt = base({
      type: "TicketUpdated",
      payload: {
        id: "t1",
        title: "VERY_LONG_TITLE_THAT_SHOULD_NOT_BE_PRINTED",
      },
    });

    // Act
    const line = formatAuditHumanSentence(evt);

    // Assert
    expect(line).not.toContain("VERY_LONG_TITLE");
    expect(line).toMatch(/changed the title/);
  });

  it("uses neutral phrasing for TicketCommentAdded", () => {
    // Setup
    const evt = base({
      type: "TicketCommentAdded",
      payload: { ticketId: "t9", body: "COMMENT_SECRET" },
    });

    // Act
    const line = formatAuditHumanSentence(evt);

    // Assert
    expect(line).toContain("added a comment on ticket t9");
    expect(line).not.toContain("COMMENT_SECRET");
  });

  it("covers epic lifecycle", () => {
    expect(
      formatAuditHumanSentence(
        base({
          type: "EpicCreated",
          payload: { id: "e1", title: "T", status: "backlog" },
        }),
      ),
    ).toMatch(/created the epic e1/);
    expect(
      formatAuditHumanSentence(
        base({
          type: "EpicUpdated",
          payload: { id: "e1", status: "done" },
        }),
      ),
    ).toMatch(/changed the status of the epic to "done"/);
    expect(
      formatAuditHumanSentence(
        base({ type: "EpicDeleted", payload: { id: "e1" } }),
      ),
    ).toMatch(/deleted the epic e1/);
  });

  it("covers story lifecycle", () => {
    expect(
      formatAuditHumanSentence(
        base({
          type: "StoryCreated",
          payload: {
            id: "s1",
            epicId: "e1",
            title: "x",
            status: "todo",
          },
        }),
      ),
    ).toMatch(/created the story s1.*under epic e1/);
    expect(
      formatAuditHumanSentence(
        base({ type: "StoryUpdated", payload: { id: "s1", body: "x" } }),
      ),
    ).toMatch(/updated the description/);
    expect(
      formatAuditHumanSentence(
        base({ type: "StoryDeleted", payload: { id: "s1" } }),
      ),
    ).toMatch(/deleted the story s1/);
  });

  it("covers ticket create with many branches without listing each", () => {
    // Act
    const line = formatAuditHumanSentence(
      base({
        type: "TicketCreated",
        payload: {
          id: "t1",
          branches: ["b1", "b2", "b3", "b4"],
        },
      }),
    );

    // Assert
    expect(line).toMatch(/with linked branches$/);
    expect(line).not.toContain("b1");
  });

  it("covers ticket create with few branches", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketCreated",
        payload: { id: "t1", branches: ["feature/a"] },
      }),
    );
    expect(line).toContain("feature/a");
  });

  it("covers ticket create with assignee", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketCreated",
        payload: { id: "t1", assignee: "bob" },
      }),
    );
    expect(line).toMatch(/assigned to "bob"/);
  });

  it("covers ticket create linked to a story", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketCreated",
        payload: { id: "t1", storyId: "s1" },
      }),
    );
    expect(line).toMatch(/linked to story s1/);
  });

  it("covers ticket update assignee cleared", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketUpdated",
        payload: { id: "t1", assignee: null },
      }),
    );
    expect(line).toMatch(/cleared the assignee/);
  });

  it("covers ticket update assignee set to a login", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketUpdated",
        payload: { id: "t1", assignee: "carol" },
      }),
    );
    expect(line).toMatch(/set the assignee to "carol"/);
  });

  it("covers ticket update moved to another story", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketUpdated",
        payload: { id: "t1", storyId: "s-new" },
      }),
    );
    expect(line).toMatch(/moved the ticket to story s-new/);
  });

  it("summarizes long branch names without listing each", () => {
    const long = "x".repeat(50);
    const line = formatAuditHumanSentence(
      base({
        type: "TicketUpdated",
        payload: { id: "t1", branches: [long] },
      }),
    );
    expect(line).toMatch(/updated linked branches$/);
    expect(line).not.toContain(long);
  });

  it("lists a few short branch names on ticket update", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "TicketUpdated",
        payload: { id: "t1", branches: ["feat/a", "fix/b"] },
      }),
    );
    expect(line).toContain("updated linked branches (feat/a, fix/b)");
  });

  it("covers ticket delete", () => {
    expect(
      formatAuditHumanSentence(
        base({ type: "TicketDeleted", payload: { id: "t1" } }),
      ),
    ).toMatch(/deleted the ticket t1/);
  });

  it("covers SyncCursor", () => {
    expect(
      formatAuditHumanSentence(
        base({ type: "SyncCursor", payload: { cursor: "c1" } }),
      ),
    ).toMatch(/advanced the GitHub sync cursor/);
  });

  it("covers GithubIssueLinked", () => {
    expect(
      formatAuditHumanSentence(
        base({
          type: "GithubIssueLinked",
          payload: { ticketId: "t1", issueNumber: 99 },
        }),
      ),
    ).toMatch(/linked ticket t1 to GitHub issue #99/);
  });

  it("covers GithubInboundUpdate without leaking title or body", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "GithubInboundUpdate",
        payload: {
          entity: "ticket",
          entityId: "t1",
          title: "STOLEN_TITLE",
          body: "STOLEN_BODY",
          status: "in_progress",
          assignee: null,
        },
      }),
    );
    expect(line).not.toContain("STOLEN");
    expect(line).toMatch(/synced ticket t1 from GitHub/);
    expect(line).toMatch(/updated the title/);
    expect(line).toMatch(/updated the description/);
    expect(line).toMatch(/"in_progress"/);
    expect(line).toMatch(/assignee cleared/);
  });

  it("covers GithubInboundUpdate assignee set to a login", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "GithubInboundUpdate",
        payload: {
          entity: "ticket",
          entityId: "t1",
          assignee: "alice",
        },
      }),
    );
    expect(line).toMatch(/assignee set to "alice"/);
  });

  it("uses neutral wording when GithubIssueLinked omits issue number", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "GithubIssueLinked",
        payload: { ticketId: "t1" },
      }),
    );
    expect(line).toMatch(/linked ticket t1 to a GitHub issue/);
  });

  it("falls back when EpicUpdated payload has only id", () => {
    const line = formatAuditHumanSentence(
      base({ type: "EpicUpdated", payload: { id: "e1" } }),
    );
    expect(line).toBe(
      "2026-01-01T12:00:00.000Z: cli:tester updated the epic e1",
    );
  });

  it("uses generic PR wording when prNumber is missing on GithubPrActivity", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "GithubPrActivity",
        payload: {
          ticketId: "t1",
          kind: "closed",
          sourceId: "s",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    expect(line).toMatch(/recorded closed on a pull request for ticket t1/);
  });

  it("covers GithubPrActivity with reviewState", () => {
    const line = formatAuditHumanSentence(
      base({
        type: "GithubPrActivity",
        payload: {
          ticketId: "t1",
          prNumber: 3,
          kind: "reviewed",
          reviewState: "approved",
          sourceId: "github-timeline:1",
          occurredAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    expect(line).toMatch(/recorded reviewed on pull request #3 for ticket t1/);
    expect(line).toMatch(/\(approved\)/);
  });
});

describe("buildAuditLinkMetadata", () => {
  it("includes epic and story ids for work items", () => {
    expect(
      buildAuditLinkMetadata(
        base({ type: "EpicCreated", payload: { id: "e1" } }),
        undefined,
      )["epicId"],
    ).toBe("e1");
    expect(
      buildAuditLinkMetadata(
        base({
          type: "StoryCreated",
          payload: { id: "s1", epicId: "e2" },
        }),
        undefined,
      ),
    ).toMatchObject({ storyId: "s1", epicId: "e2" });
    expect(
      buildAuditLinkMetadata(
        base({
          type: "TicketUpdated",
          payload: { id: "t1", storyId: "s9" },
        }),
        undefined,
      ),
    ).toMatchObject({ ticketId: "t1", storyId: "s9" });
  });

  it("adds issueHtmlUrl when repo is known", () => {
    // Act
    const meta = buildAuditLinkMetadata(
      base({
        type: "GithubIssueLinked",
        payload: { ticketId: "t1", issueNumber: 5 },
      }),
      repo,
    );

    // Assert
    expect(meta["issueHtmlUrl"]).toBe("https://github.com/acme/demo/issues/5");
  });

  it("omits derived URLs when repo is missing", () => {
    const meta = buildAuditLinkMetadata(
      base({
        type: "GithubIssueLinked",
        payload: { ticketId: "t1", issueNumber: 5 },
      }),
      undefined,
    );
    expect(meta["issueHtmlUrl"]).toBeUndefined();
    expect(meta["issueNumber"]).toBe(5);
  });

  it("omits issueHtmlUrl when issue number is missing even with repo", () => {
    const meta = buildAuditLinkMetadata(
      base({ type: "GithubIssueLinked", payload: { ticketId: "t1" } }),
      repo,
    );
    expect(meta["issueHtmlUrl"]).toBeUndefined();
  });

  it("omits cursor in metadata when absent on SyncCursor", () => {
    const meta = buildAuditLinkMetadata(
      base({ type: "SyncCursor", payload: {} }),
      undefined,
    );
    expect(meta["cursor"]).toBeUndefined();
  });

  it("still sets commentId when ticketId is missing on TicketCommentAdded", () => {
    const meta = buildAuditLinkMetadata(
      base({ type: "TicketCommentAdded", payload: { body: "x" } }),
      undefined,
    );
    expect(meta["ticketId"]).toBeUndefined();
    expect(meta["commentId"]).toBe("evt-1");
  });

  it("adds pullHtmlUrl for GithubPrActivity", () => {
    const meta = buildAuditLinkMetadata(
      base({
        type: "GithubPrActivity",
        payload: {
          ticketId: "t1",
          prNumber: 7,
          kind: "merged",
          sourceId: "s",
          occurredAt: "2026-01-01T00:00:00.000Z",
          url: "https://api.github.com/1",
        },
      }),
      repo,
    );
    expect(meta["pullHtmlUrl"]).toBe("https://github.com/acme/demo/pull/7");
    expect(meta["url"]).toBe("https://api.github.com/1");
  });

  it("flags inbound title/body changes without embedding text", () => {
    const meta = buildAuditLinkMetadata(
      base({
        type: "GithubInboundUpdate",
        payload: {
          entity: "ticket",
          entityId: "t1",
          title: "X",
          body: "Y",
        },
      }),
      repo,
    );
    expect(meta["titleChanged"]).toBe(true);
    expect(meta["descriptionChanged"]).toBe(true);
    expect(JSON.stringify(meta)).not.toContain("X");
    expect(JSON.stringify(meta)).not.toContain("Y");
  });
});

describe("formatAuditPlainLines", () => {
  it("returns an empty string for no events", () => {
    expect(formatAuditPlainLines([], { style: "plain" })).toBe("");
  });

  it("joins plain lines without metadata", () => {
    // Setup
    const events = [
      base({ type: "EpicDeleted", id: "a", payload: { id: "e1" } }),
      base({ type: "EpicDeleted", id: "b", payload: { id: "e2" } }),
    ];

    // Act
    const out = formatAuditPlainLines(events, { style: "plain" });

    // Assert
    expect(out.split("\n")).toHaveLength(2);
    expect(out).not.toContain("\t{");
  });

  it("appends compact JSON for plain-links", () => {
    // Setup
    const events = [
      base({
        type: "GithubIssueLinked",
        id: "z",
        payload: { ticketId: "t1", issueNumber: 1 },
      }),
    ];

    // Act
    const out = formatAuditPlainLines(events, {
      style: "plain-links",
      githubRepo: repo,
    });

    // Assert
    const [sentence, jsonPart] = out.split("\t");
    expect(sentence).toContain("linked ticket t1");
    const parsed = JSON.parse(jsonPart ?? "{}") as { issueHtmlUrl?: string };
    expect(parsed.issueHtmlUrl).toContain("issues/1");
  });
});
