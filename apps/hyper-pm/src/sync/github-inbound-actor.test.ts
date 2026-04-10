/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import { githubInboundActorFromIssue } from "./github-inbound-actor";

describe("githubInboundActorFromIssue", () => {
  it("returns github:login when user.login is set", () => {
    // Act
    const out = githubInboundActorFromIssue({
      user: { login: "dev" },
    });

    // Assert
    expect(out).toBe("github:dev");
  });

  it("trims login", () => {
    // Act
    const out = githubInboundActorFromIssue({
      user: { login: "  x  " },
    });

    // Assert
    expect(out).toBe("github:x");
  });

  it("returns github-inbound when user is absent", () => {
    // Act
    const out = githubInboundActorFromIssue({});

    // Assert
    expect(out).toBe("github-inbound");
  });

  it("returns github-inbound when login is null or empty", () => {
    // Act
    const a = githubInboundActorFromIssue({ user: { login: null } });
    const b = githubInboundActorFromIssue({ user: { login: "" } });

    // Assert
    expect(a).toBe("github-inbound");
    expect(b).toBe("github-inbound");
  });
});
