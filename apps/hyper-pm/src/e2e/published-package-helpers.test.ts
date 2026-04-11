/** @vitest-environment node */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDistMainExists,
  assertPublishedExportKeys,
  getDistIndexPath,
  getDistMainPath,
  getExpectedPublishedExportKeys,
  loadPublishedIndexExports,
  npmInstallTarball,
  pathToInstalledPackageMain,
  readPackageIdentity,
  resolveHyperPmPackageRootFromE2eImportMetaUrl,
  runBundledCliHelp,
  runNpmPackIntoDir,
} from "./published-package-helpers";

describe("resolveHyperPmPackageRootFromE2eImportMetaUrl", () => {
  it("walks up from src/e2e to the package root", () => {
    // Setup
    const pkgRoot = join(tmpdir(), "hyper-pm-pkg-root");
    const inE2e = join(pkgRoot, "src", "e2e", "mod.ts");
    const url = pathToFileURL(inE2e).href;

    // Act
    const resolved = resolveHyperPmPackageRootFromE2eImportMetaUrl(url);

    // Assert
    expect(resolved).toBe(pkgRoot);
  });
});

describe("getDistMainPath / getDistIndexPath", () => {
  it("returns dist entry paths under the package root", () => {
    // Act
    const main = getDistMainPath("/pkg");
    const index = getDistIndexPath("/pkg");

    // Assert
    expect(main).toBe(join("/pkg", "dist", "main.cjs"));
    expect(index).toBe(join("/pkg", "dist", "index.cjs"));
  });
});

describe("assertDistMainExists", () => {
  it("throws when dist/main.cjs is missing", () => {
    // Act & Assert
    expect(() => assertDistMainExists("/pkg", () => false)).toThrow(
      /Missing .*dist\/main\.cjs.*pnpm run build/s,
    );
  });

  it("does not throw when dist/main.cjs exists", () => {
    // Act & Assert
    expect(() => assertDistMainExists("/pkg", () => true)).not.toThrow();
  });
});

describe("runBundledCliHelp", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns node with main.cjs and --help", () => {
    // Setup
    const spawnSync = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: "", stderr: "" });

    // Act
    runBundledCliHelp("/x/main.cjs", {
      spawnSync,
      nodeExecutable: "/bin/node",
    });

    // Assert
    expect(spawnSync).toHaveBeenCalledWith(
      "/bin/node",
      ["/x/main.cjs", "--help"],
      {
        encoding: "utf8",
      },
    );
  });

  it("uses process.execPath when nodeExecutable is omitted", () => {
    // Setup
    const spawnSync = vi
      .fn()
      .mockReturnValue({ status: 0, stdout: "", stderr: "" });

    // Act
    runBundledCliHelp("/x/main.cjs", { spawnSync });

    // Assert
    const firstCall = spawnSync.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0]).toBe(process.execPath);
  });
});

describe("getExpectedPublishedExportKeys", () => {
  it("returns the sorted public export names", () => {
    // Act
    const keys = getExpectedPublishedExportKeys();

    // Assert
    expect(keys).toEqual(
      ["ExitCode", "openDataBranchWorktree", "runCli", "runGit"].sort(),
    );
  });
});

describe("loadPublishedIndexExports", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("anchors require() at package.json and loads ./dist/index.cjs", () => {
    // Setup
    const req = vi.fn().mockReturnValue({ runCli: () => undefined });
    const createRequire = vi.fn().mockReturnValue(req);

    // Act
    const mod = loadPublishedIndexExports("/pkg", { createRequire });

    // Assert
    expect(createRequire).toHaveBeenCalledWith(join("/pkg", "package.json"));
    expect(req).toHaveBeenCalledWith("./dist/index.cjs");
    expect(mod).toEqual({ runCli: expect.any(Function) });
  });
});

describe("assertPublishedExportKeys", () => {
  it("passes when keys match", () => {
    // Act & Assert
    expect(() =>
      assertPublishedExportKeys(
        {
          runCli: () => undefined,
          ExitCode: {},
          openDataBranchWorktree: () => undefined,
          runGit: () => undefined,
        },
        getExpectedPublishedExportKeys(),
      ),
    ).not.toThrow();
  });

  it("throws when keys differ", () => {
    // Act & Assert
    expect(() =>
      assertPublishedExportKeys(
        { runCli: () => undefined },
        getExpectedPublishedExportKeys(),
      ),
    ).toThrow();
  });
});

describe("readPackageIdentity", () => {
  it("parses name and version from package.json", () => {
    // Setup
    const readFileSync = vi
      .fn()
      .mockReturnValue(JSON.stringify({ name: "hyper-pm", version: "9.9.9" }));

    // Act
    const id = readPackageIdentity("/root", readFileSync);

    // Assert
    expect(readFileSync).toHaveBeenCalledWith(
      join("/root", "package.json"),
      "utf8",
    );
    expect(id).toEqual({ name: "hyper-pm", version: "9.9.9" });
  });
});

describe("runNpmPackIntoDir", () => {
  it("throws when npm pack output is empty", () => {
    // Act & Assert
    expect(() =>
      runNpmPackIntoDir("/r", "/d", { execFileSync: () => "" }),
    ).toThrow(/npm pack produced empty output/);
  });

  it("returns an absolute path when npm prints an absolute tarball path", () => {
    // Setup
    const execFileSync = vi.fn().mockReturnValue("/abs/pkg-1.0.0.tgz\n");

    // Act
    const path = runNpmPackIntoDir("/r", "/d", { execFileSync });

    // Assert
    expect(path).toBe("/abs/pkg-1.0.0.tgz");
  });

  it("joins destDir when npm prints a relative tarball name", () => {
    // Setup
    const execFileSync = vi.fn().mockReturnValue("hyper-pm-0.1.0.tgz");

    // Act
    const path = runNpmPackIntoDir("/r", "/dest", { execFileSync });

    // Assert
    expect(path).toBe(join("/dest", "hyper-pm-0.1.0.tgz"));
  });
});

describe("npmInstallTarball", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs npm install with the tarball path", () => {
    // Setup
    const execFileSync = vi.fn().mockReturnValue("");

    // Act
    npmInstallTarball("/a/pkg.tgz", "/install-here", { execFileSync });

    // Assert
    expect(execFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "/a/pkg.tgz"],
      {
        cwd: "/install-here",
        encoding: "utf8",
      },
    );
  });
});

describe("pathToInstalledPackageMain", () => {
  it("resolves unscoped packages under node_modules", () => {
    // Act
    const p = pathToInstalledPackageMain("/i", "hyper-pm");

    // Assert
    expect(p).toBe(join("/i", "node_modules", "hyper-pm", "dist", "main.cjs"));
  });

  it("resolves scoped packages under node_modules", () => {
    // Act
    const p = pathToInstalledPackageMain("/i", "@acme/hyper-pm");

    // Assert
    expect(p).toBe(
      join("/i", "node_modules", "@acme", "hyper-pm", "dist", "main.cjs"),
    );
  });
});

describe("runNpmPackIntoDir integration line parsing", () => {
  it("uses the last non-empty line when npm prints multiple lines", () => {
    // Setup
    const execFileSync = vi
      .fn()
      .mockReturnValue("npm notice …\nhyper-pm-1.0.0.tgz\n");

    // Act
    const path = runNpmPackIntoDir("/r", "/dest", { execFileSync });

    // Assert
    expect(path).toBe(join("/dest", "hyper-pm-1.0.0.tgz"));
  });
});
