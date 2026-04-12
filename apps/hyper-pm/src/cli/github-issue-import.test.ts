/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import type { Projection, TicketRecord } from "../storage/projection";
import {
  buildTicketCreatedPayloadBaseFromGithubIssue,
  classifyGithubIssueForImport,
  collectLinkedGithubIssueNumbers,
  mergeTicketImportCreatePayload,
  parseGithubImportIssueNumberSet,
  partitionGithubIssuesForImport,
  stripHyperPmGithubIssueTitle,
  ticketCreatePlanningFragmentFromFenceMeta,
  tryParseGithubImportListState,
} from "./github-issue-import";

const audit = {
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "a",
  updatedAt: "2026-01-01T00:00:00.000Z",
  updatedBy: "a",
  statusChangedAt: "2026-01-01T00:00:00.000Z",
  statusChangedBy: "a",
};

const baseTicket = (
  partial: Partial<TicketRecord> & { id: string },
): TicketRecord => ({
  id: partial.id,
  number: partial.number ?? 1,
  storyId: partial.storyId ?? null,
  title: partial.title ?? "",
  body: partial.body ?? "",
  status: partial.status ?? "todo",
  linkedPrs: partial.linkedPrs ?? [],
  linkedBranches: partial.linkedBranches ?? [],
  prActivityRecent: partial.prActivityRecent,
  githubIssueNumber: partial.githubIssueNumber,
  assignee: partial.assignee,
  labels: partial.labels,
  priority: partial.priority,
  size: partial.size,
  estimate: partial.estimate,
  startWorkAt: partial.startWorkAt,
  targetFinishAt: partial.targetFinishAt,
  comments: partial.comments,
  deleted: partial.deleted,
  ...audit,
});

const emptyProjection = (tickets: TicketRecord[]): Projection => {
  const m = new Map<string, TicketRecord>();
  for (const t of tickets) {
    m.set(t.id, t);
  }
  return { epics: new Map(), stories: new Map(), tickets: m };
};

describe("collectLinkedGithubIssueNumbers", () => {
  it("returns empty set when no tickets are linked", () => {
    // Act
    const s = collectLinkedGithubIssueNumbers(emptyProjection([]));

    // Assert
    expect(s.size).toBe(0);
  });

  it("collects githubIssueNumber from non-deleted tickets only", () => {
    // Setup
    const p = emptyProjection([
      baseTicket({ id: "t1", githubIssueNumber: 3 }),
      baseTicket({ id: "t2", githubIssueNumber: 4, deleted: true }),
      baseTicket({ id: "t3" }),
    ]);

    // Act
    const s = collectLinkedGithubIssueNumbers(p);

    // Assert
    expect([...s].sort((a, b) => a - b)).toEqual([3]);
  });
});

describe("stripHyperPmGithubIssueTitle", () => {
  it("strips a leading hyper-pm prefix case-insensitively", () => {
    // Act
    const a = stripHyperPmGithubIssueTitle("[hyper-pm] Do the thing");
    const b = stripHyperPmGithubIssueTitle("[HYPER-PM]   spaced");

    // Assert
    expect(a).toBe("Do the thing");
    expect(b).toBe("spaced");
  });

  it("returns trimmed title when prefix absent", () => {
    // Act
    const out = stripHyperPmGithubIssueTitle("  Plain title  ");

    // Assert
    expect(out).toBe("Plain title");
  });
});

describe("tryParseGithubImportListState", () => {
  it("defaults to all for undefined or empty", () => {
    expect(tryParseGithubImportListState(undefined)).toBe("all");
    expect(tryParseGithubImportListState("")).toBe("all");
  });

  it("accepts open, closed, and all with case insensitivity", () => {
    expect(tryParseGithubImportListState("OPEN")).toBe("open");
    expect(tryParseGithubImportListState("Closed")).toBe("closed");
    expect(tryParseGithubImportListState("ALL")).toBe("all");
  });

  it("returns undefined for invalid values", () => {
    expect(tryParseGithubImportListState("merged")).toBeUndefined();
  });
});

describe("parseGithubImportIssueNumberSet", () => {
  it("returns undefined when raw is undefined or empty", () => {
    expect(parseGithubImportIssueNumberSet(undefined)).toBeUndefined();
    expect(parseGithubImportIssueNumberSet([])).toBeUndefined();
  });

  it("parses comma-separated and repeated flags", () => {
    // Act
    const s = parseGithubImportIssueNumberSet(["1,2", "3"]);

    // Assert
    expect([...s!].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("throws on invalid tokens", () => {
    expect(() => parseGithubImportIssueNumberSet(["0"])).toThrow(
      "Invalid --issue value",
    );
    expect(() => parseGithubImportIssueNumberSet(["x"])).toThrow(
      "Invalid --issue value",
    );
  });

  it("throws when no numbers remain after parsing", () => {
    expect(() => parseGithubImportIssueNumberSet(["  ,  "])).toThrow(
      "No valid --issue numbers",
    );
  });
});

describe("ticketCreatePlanningFragmentFromFenceMeta", () => {
  it("returns empty object when meta is undefined", () => {
    expect(ticketCreatePlanningFragmentFromFenceMeta(undefined)).toEqual({});
  });

  it("drops null planning values from the fragment", () => {
    // Setup
    const meta: Record<string, unknown> = {
      priority: null,
      size: "m",
    };

    // Act
    const out = ticketCreatePlanningFragmentFromFenceMeta(meta);

    // Assert
    expect(out).toEqual({ size: "m" });
  });
});

describe("buildTicketCreatedPayloadBaseFromGithubIssue", () => {
  it("maps open issue with assignee and labels", () => {
    // Setup
    const issue = {
      number: 9,
      title: "[hyper-pm] Title",
      body: "Desc\n\n```json\n{}\n```\n",
      state: "open",
      labels: [{ name: "bug" }, { name: "area-ui" }],
      assignees: [{ login: "Alice" }],
    };

    // Act
    const p = buildTicketCreatedPayloadBaseFromGithubIssue(issue);

    // Assert
    expect(p).toMatchObject({
      title: "Title",
      body: "Desc",
      assignee: "alice",
    });
    expect(p["state"]).toBeUndefined();
    expect(p["labels"]).toEqual(["bug", "area-ui"]);
  });

  it("sets legacy closed state for closed issues", () => {
    // Act
    const p = buildTicketCreatedPayloadBaseFromGithubIssue({
      number: 1,
      title: "T",
      body: "",
      state: "closed",
    });

    // Assert
    expect(p["state"]).toBe("closed");
  });

  it("treats null title like empty string for mapping", () => {
    // Act
    const p = buildTicketCreatedPayloadBaseFromGithubIssue({
      number: 2,
      title: null,
      body: "x",
      state: "open",
    });

    // Assert
    expect(p["title"]).toBe("");
  });

  it("omits assignee when none are present", () => {
    // Act
    const p = buildTicketCreatedPayloadBaseFromGithubIssue({
      number: 2,
      title: "T",
      body: "",
      state: "open",
      assignees: [],
    });

    // Assert
    expect(p).not.toHaveProperty("assignee");
  });

  it("does not set closed state when state is not closed", () => {
    // Act
    const p = buildTicketCreatedPayloadBaseFromGithubIssue({
      number: 2,
      title: "T",
      body: "",
      state: "open",
    });

    // Assert
    expect(p["state"]).toBeUndefined();
  });

  it("merges planning fields from a json fence", () => {
    // Setup
    const body = `Hello\n\n\`\`\`json\n{"priority": "high", "estimate": 3}\n\`\`\`\n`;

    // Act
    const p = buildTicketCreatedPayloadBaseFromGithubIssue({
      number: 2,
      title: "T",
      body,
      state: "open",
    });

    // Assert
    expect(p["priority"]).toBe("high");
    expect(p["estimate"]).toBe(3);
  });
});

describe("classifyGithubIssueForImport", () => {
  const linked = new Set([100]);

  it("skips pull requests", () => {
    // Setup
    const p = emptyProjection([]);

    // Act
    const r = classifyGithubIssueForImport({
      projection: p,
      linkedNumbers: linked,
      issue: { number: 1, pull_request: {} },
    });

    // Assert
    expect(r).toEqual({
      result: "skip",
      skip: { issueNumber: 1, reason: "pull_request" },
    });
  });

  it("skips when issue number is in onlyIssueNumbers allowlist negatively", () => {
    // Setup
    const p = emptyProjection([]);
    const only = new Set([5]);

    // Act
    const r = classifyGithubIssueForImport({
      projection: p,
      linkedNumbers: linked,
      onlyIssueNumbers: only,
      issue: { number: 9, title: "x" },
    });

    // Assert
    expect(r).toEqual({
      result: "skip",
      skip: { issueNumber: 9, reason: "issue_filter" },
    });
  });

  it("skips already linked numbers", () => {
    // Act
    const r = classifyGithubIssueForImport({
      projection: emptyProjection([]),
      linkedNumbers: linked,
      issue: { number: 100, title: "x" },
    });

    // Assert
    expect(r).toEqual({
      result: "skip",
      skip: { issueNumber: 100, reason: "already_linked" },
    });
  });

  it("skips when body hyper_pm_id matches a live ticket", () => {
    // Setup
    const body = '```json\n{"hyper_pm_id":"t1"}\n```\n';
    const p = emptyProjection([baseTicket({ id: "t1", title: "Live" })]);

    // Act
    const r = classifyGithubIssueForImport({
      projection: p,
      linkedNumbers: new Set(),
      issue: { number: 7, title: "GH", body },
    });

    // Assert
    expect(r).toEqual({
      result: "skip",
      skip: { issueNumber: 7, reason: "body_hyper_pm_existing_ticket" },
    });
  });

  it("skips orphan hyper_pm_id when ticket is deleted or missing", () => {
    // Setup
    const bodyMissing = '```json\n{"hyper_pm_id":"nope"}\n```\n';
    const bodyDeleted = '```json\n{"hyper_pm_id":"gone"}\n```\n';
    const p = emptyProjection([
      baseTicket({ id: "gone", title: "X", deleted: true }),
    ]);

    // Act
    const a = classifyGithubIssueForImport({
      projection: p,
      linkedNumbers: new Set(),
      issue: { number: 1, title: "A", body: bodyMissing },
    });
    const b = classifyGithubIssueForImport({
      projection: p,
      linkedNumbers: new Set(),
      issue: { number: 2, title: "B", body: bodyDeleted },
    });

    // Assert
    expect(a).toEqual({
      result: "skip",
      skip: { issueNumber: 1, reason: "body_hyper_pm_orphan_ref" },
    });
    expect(b).toEqual({
      result: "skip",
      skip: { issueNumber: 2, reason: "body_hyper_pm_orphan_ref" },
    });
  });

  it("treats empty hyper_pm_id in fence as not managed", () => {
    // Setup
    const body = '```json\n{"hyper_pm_id":""}\n```\n';

    // Act
    const r = classifyGithubIssueForImport({
      projection: emptyProjection([]),
      linkedNumbers: new Set(),
      issue: { number: 8, title: "T", body },
    });

    // Assert
    expect(r.result).toBe("candidate");
  });

  it("returns candidate for a plain GitHub issue", () => {
    // Act
    const r = classifyGithubIssueForImport({
      projection: emptyProjection([]),
      linkedNumbers: new Set(),
      issue: { number: 42, title: "Need import", body: "Hello" },
    });

    // Assert
    expect(r.result).toBe("candidate");
    if (r.result === "candidate") {
      expect(r.ticketCreatedPayloadBase["title"]).toBe("Need import");
      expect(r.ticketCreatedPayloadBase["body"]).toBe("Hello");
    }
  });

  it("skips invalid issue numbers", () => {
    // Act
    const r = classifyGithubIssueForImport({
      projection: emptyProjection([]),
      linkedNumbers: new Set(),
      issue: { number: Number.NaN, title: "x" },
    });

    // Assert
    expect(r).toEqual({
      result: "skip",
      skip: { issueNumber: 0, reason: "issue_filter" },
    });
  });

  it("skips non-positive issue numbers", () => {
    // Act
    const r = classifyGithubIssueForImport({
      projection: emptyProjection([]),
      linkedNumbers: new Set(),
      issue: { number: 0, title: "x" },
    });

    // Assert
    expect(r).toEqual({
      result: "skip",
      skip: { issueNumber: 0, reason: "issue_filter" },
    });
  });
});

describe("partitionGithubIssuesForImport", () => {
  it("partitions mixed issues into candidates and skips", () => {
    // Setup
    const p = emptyProjection([baseTicket({ id: "t1", githubIssueNumber: 1 })]);
    const issues = [
      { number: 1, title: "linked" },
      { number: 2, title: "ok", body: "b" },
      { number: 3, title: "pr", pull_request: {} },
    ];

    // Act
    const { candidates, skipped } = partitionGithubIssuesForImport({
      projection: p,
      issues,
    });

    // Assert
    expect(candidates.map((c) => c.issueNumber)).toEqual([2]);
    expect(skipped.map((s) => [s.issueNumber, s.reason])).toEqual([
      [1, "already_linked"],
      [3, "pull_request"],
    ]);
  });
});

describe("mergeTicketImportCreatePayload", () => {
  it("adds id, number, and optional storyId", () => {
    // Act
    const full = mergeTicketImportCreatePayload(
      "tid",
      { title: "T", body: "" },
      "  s1  ",
      4,
    );

    // Assert
    expect(full).toEqual({
      id: "tid",
      number: 4,
      title: "T",
      body: "",
      storyId: "s1",
    });
  });

  it("omits storyId when story argument is empty", () => {
    // Act
    const full = mergeTicketImportCreatePayload("tid", { title: "T" }, "", 1);

    // Assert
    expect(full).toEqual({ id: "tid", number: 1, title: "T" });
    expect(full).not.toHaveProperty("storyId");
  });
});
