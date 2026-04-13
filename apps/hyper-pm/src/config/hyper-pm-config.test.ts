import { describe, expect, it } from "vitest";
import {
  hyperPmConfigForSyncWithGithub,
  hyperPmConfigSchema,
} from "./hyper-pm-config";

describe("hyperPmConfigForSyncWithGithub", () => {
  it("sets sync to full and preserves other fields", () => {
    // Setup
    const cfg = hyperPmConfigSchema.parse({
      schema: 1,
      dataBranch: "hyper-pm-data",
      remote: "origin",
      sync: "outbound",
      issueMapping: "ticket",
      githubRepo: "acme/app",
    });

    // Act
    const out = hyperPmConfigForSyncWithGithub(cfg);

    // Assert
    expect(out.sync).toBe("full");
    expect(out.dataBranch).toBe("hyper-pm-data");
    expect(out.remote).toBe("origin");
    expect(out.issueMapping).toBe("ticket");
    expect(out.githubRepo).toBe("acme/app");
    expect(out).not.toBe(cfg);
  });
});
