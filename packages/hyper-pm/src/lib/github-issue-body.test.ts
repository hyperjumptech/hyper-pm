import { describe, expect, it } from "vitest";
import {
  buildGithubIssueBody,
  parseHyperPmIdFromIssueBody,
} from "./github-issue-body";

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
});
