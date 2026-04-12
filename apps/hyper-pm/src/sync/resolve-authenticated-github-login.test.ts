/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolveGithubTokenForSyncFn } from "./resolve-authenticated-github-login";
import {
  fetchGithubAuthenticatedLogin,
  resolveAuthenticatedGithubLogin,
} from "./resolve-authenticated-github-login";

describe("fetchGithubAuthenticatedLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns normalized login on OK JSON with login", async () => {
    // Setup
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ login: "SomeUser" }),
    });

    // Act
    const login = await fetchGithubAuthenticatedLogin("tok", fetchFn);

    // Assert
    expect(login).toBe("someuser");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.github.com/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
        }),
      }),
    );
  });

  it("returns null when response is not OK", async () => {
    // Setup
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });

    // Act
    const login = await fetchGithubAuthenticatedLogin("tok", fetchFn);

    // Assert
    expect(login).toBeNull();
  });

  it("returns null when login is missing or blank", async () => {
    // Setup
    const fetchMissing = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const fetchBlank = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ login: "   " }),
    });

    // Act
    const a = await fetchGithubAuthenticatedLogin("tok", fetchMissing);
    const b = await fetchGithubAuthenticatedLogin("tok", fetchBlank);

    // Assert
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});

describe("resolveAuthenticatedGithubLogin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when token resolution yields null", async () => {
    // Setup
    const resolveGithubTokenForSync: ResolveGithubTokenForSyncFn = vi
      .fn()
      .mockResolvedValue(null);

    // Act
    const login = await resolveAuthenticatedGithubLogin(
      { envToken: undefined, cwd: "/r" },
      { resolveGithubTokenForSync },
    );

    // Assert
    expect(login).toBeNull();
    expect(resolveGithubTokenForSync).toHaveBeenCalledWith({
      envToken: undefined,
      cwd: "/r",
    });
  });

  it("delegates to fetchGithubAuthenticatedLogin when token exists", async () => {
    // Setup
    const resolveGithubTokenForSync: ResolveGithubTokenForSyncFn = vi
      .fn()
      .mockResolvedValue("secret");
    const fetchGithubAuthenticatedLogin = vi.fn().mockResolvedValue("alice");

    // Act
    const login = await resolveAuthenticatedGithubLogin(
      { envToken: "x", cwd: "/repo" },
      { resolveGithubTokenForSync, fetchGithubAuthenticatedLogin },
    );

    // Assert
    expect(login).toBe("alice");
    expect(fetchGithubAuthenticatedLogin).toHaveBeenCalledWith("secret");
  });
});
