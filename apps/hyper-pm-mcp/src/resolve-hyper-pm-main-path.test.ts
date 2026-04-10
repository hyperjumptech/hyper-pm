/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { resolveHyperPmMainPath } from "./resolve-hyper-pm-main-path";

describe("resolveHyperPmMainPath", () => {
  it("returns HYPER_PM_CLI_PATH when set and non-empty", () => {
    // Act
    const p = resolveHyperPmMainPath({
      env: { HYPER_PM_CLI_PATH: "/abs/hyper-pm/main.cjs" },
      resolvePackageEntry: () => {
        throw new Error("should not resolve package");
      },
      joinPaths: (...parts: string[]) => parts.join("/"),
      dirnamePath: (p: string) => p,
    });

    // Assert
    expect(p).toBe("/abs/hyper-pm/main.cjs");
  });

  it("resolves dist/main.cjs from the package entry path when override is absent", () => {
    // Act
    const p = resolveHyperPmMainPath({
      env: {},
      resolvePackageEntry: () => "/mono/hyper-pm/dist/index.cjs",
      joinPaths: (...parts: string[]) => parts.join("/"),
      dirnamePath: (path: string) => path.replace(/\/[^/]+$/, ""),
    });

    // Assert
    expect(p).toBe("/mono/hyper-pm/dist/../dist/main.cjs");
  });

  it("resolves hyper-pm next to the installed package by default", () => {
    // Act
    const p = resolveHyperPmMainPath();

    // Assert
    expect(p).toMatch(/[\\/]hyper-pm[\\/]dist[\\/]main\.cjs$/);
  });

  it("treats empty string override as unset", () => {
    // Act
    const p = resolveHyperPmMainPath({
      env: { HYPER_PM_CLI_PATH: "" },
      resolvePackageEntry: () => "/p/hyper-pm/dist/index.cjs",
      joinPaths: (...parts: string[]) => parts.join("/"),
      dirnamePath: (path: string) => path.replace(/\/[^/]+$/, ""),
    });

    // Assert
    expect(p).toBe("/p/hyper-pm/dist/../dist/main.cjs");
  });
});
