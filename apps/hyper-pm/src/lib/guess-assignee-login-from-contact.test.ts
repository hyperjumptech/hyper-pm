import { describe, expect, it } from "vitest";
import {
  githubLoginFromNoreplyEmail,
  githubLoginGuessFromGenericEmail,
  guessGithubLoginFromContact,
  looksLikeGithubUsername,
} from "./guess-assignee-login-from-contact";

describe("looksLikeGithubUsername", () => {
  it("accepts simple logins", () => {
    expect(looksLikeGithubUsername("octocat")).toBe(true);
    expect(looksLikeGithubUsername("a")).toBe(true);
    expect(looksLikeGithubUsername("foo-bar")).toBe(true);
  });

  it("rejects empty, too long, bad edges, or invalid chars", () => {
    expect(looksLikeGithubUsername("")).toBe(false);
    expect(looksLikeGithubUsername("a".repeat(40))).toBe(false);
    expect(looksLikeGithubUsername("-ab")).toBe(false);
    expect(looksLikeGithubUsername("ab-")).toBe(false);
    expect(looksLikeGithubUsername("ab--c")).toBe(false);
    expect(looksLikeGithubUsername("ab_c")).toBe(false);
    expect(looksLikeGithubUsername("ab.c")).toBe(false);
  });
});

describe("githubLoginFromNoreplyEmail", () => {
  it("parses id+login noreply form", () => {
    expect(
      githubLoginFromNoreplyEmail("12345+OctoCat@users.noreply.github.com"),
    ).toBe("octocat");
  });

  it("parses plain login noreply form", () => {
    expect(
      githubLoginFromNoreplyEmail("octocat@users.noreply.github.com"),
    ).toBe("octocat");
  });

  it("returns undefined for numeric-only local part", () => {
    expect(
      githubLoginFromNoreplyEmail("123456789@users.noreply.github.com"),
    ).toBeUndefined();
  });

  it("returns undefined for non-noreply domains", () => {
    expect(githubLoginFromNoreplyEmail("octocat@github.com")).toBeUndefined();
  });
});

describe("githubLoginGuessFromGenericEmail", () => {
  it("uses local-part when it looks like a username", () => {
    expect(githubLoginGuessFromGenericEmail("Pat@example.com")).toBe("pat");
  });

  it("strips plus-tags before guessing", () => {
    expect(githubLoginGuessFromGenericEmail("Pat+tag@example.com")).toBe("pat");
  });

  it("returns undefined when local-part is not username-shaped", () => {
    expect(
      githubLoginGuessFromGenericEmail("pat.doe@example.com"),
    ).toBeUndefined();
  });
});

describe("guessGithubLoginFromContact", () => {
  it("prefers noreply parsing over name", () => {
    expect(
      guessGithubLoginFromContact("wrong", "1+real@users.noreply.github.com"),
    ).toBe("real");
  });

  it("falls back to generic email local-part", () => {
    expect(guessGithubLoginFromContact("", "alice@corp.example")).toBe("alice");
  });

  it("falls back to name when email yields nothing", () => {
    expect(guessGithubLoginFromContact("valid-user", "___@example.com")).toBe(
      "valid-user",
    );
  });

  it("returns undefined when nothing matches", () => {
    expect(
      guessGithubLoginFromContact("Not A Login", "___@example.com"),
    ).toBeUndefined();
  });
});
