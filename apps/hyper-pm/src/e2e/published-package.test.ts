/** @vitest-environment node */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertDistMainExists,
  assertPublishedExportKeys,
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

describe("published hyper-pm artifacts", () => {
  const packageRoot = resolveHyperPmPackageRootFromE2eImportMetaUrl(
    import.meta.url,
  );

  it("ships a runnable dist/main.cjs that responds to --help", () => {
    // Setup
    assertDistMainExists(packageRoot);
    const main = getDistMainPath(packageRoot);

    // Act
    const result = runBundledCliHelp(main);

    // Assert
    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/hyper-pm/);
  });

  it("ships dist/index.cjs with the documented public exports", () => {
    // Setup
    assertDistMainExists(packageRoot);

    // Act
    const api = loadPublishedIndexExports(packageRoot);

    // Assert
    assertPublishedExportKeys(api, getExpectedPublishedExportKeys());
    expect(typeof api.runCli).toBe("function");
    expect(typeof api.runGit).toBe("function");
    expect(typeof api.openDataBranchWorktree).toBe("function");
    expect(api.ExitCode).toBeDefined();
  });
});

describe("published hyper-pm npm tarball", () => {
  let work: string;

  afterEach(async () => {
    await rm(work, { recursive: true, force: true });
  });

  it("packs and installs so the consumer can run the CLI from node_modules", async () => {
    // Setup
    const pkgRoot = resolveHyperPmPackageRootFromE2eImportMetaUrl(
      import.meta.url,
    );
    assertDistMainExists(pkgRoot);
    work = await mkdtemp(join(tmpdir(), "hyper-pm-published-"));
    const packDest = join(work, "pack-out");
    const installDir = join(work, "install");
    await mkdir(packDest, { recursive: true });
    await mkdir(installDir, { recursive: true });
    const pkgPath = join(pkgRoot, "package.json");
    const raw = await readFile(pkgPath, "utf8");
    const manifest = JSON.parse(raw) as { name: string; version: string };

    // Act
    const tarball = runNpmPackIntoDir(pkgRoot, packDest);
    npmInstallTarball(tarball, installDir);
    const id = readPackageIdentity(pkgRoot);
    const main = pathToInstalledPackageMain(installDir, id.name);
    const help = runBundledCliHelp(main);

    // Assert
    expect(id.name).toBe(manifest.name);
    expect(id.version).toBe(manifest.version);
    expect(help.status).toBe(0);
    expect(`${help.stdout}\n${help.stderr}`).toMatch(/hyper-pm/);
  }, 60_000);
});
