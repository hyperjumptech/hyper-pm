import {
  execFileSync,
  spawnSync,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import { deepStrictEqual } from "node:assert/strict";
import { existsSync, readFileSync, type PathLike } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the `hyper-pm` package root (directory containing `package.json`) from an
 * `import.meta.url` value for a module under `src/e2e/`.
 *
 * @param importMetaUrl - `import.meta.url` of the caller (e.g. an e2e test module).
 * @returns Absolute path to the package root.
 */
export const resolveHyperPmPackageRootFromE2eImportMetaUrl = (
  importMetaUrl: string,
): string => {
  const filePath = fileURLToPath(importMetaUrl);
  return join(dirname(filePath), "..", "..");
};

/**
 * @param packageRoot - Absolute path to the `hyper-pm` package root.
 * @returns Absolute path to the bundled CLI entry (`dist/main.cjs`).
 */
export const getDistMainPath = (packageRoot: string): string =>
  join(packageRoot, "dist", "main.cjs");

/**
 * @param packageRoot - Absolute path to the `hyper-pm` package root.
 * @returns Absolute path to the bundled library entry (`dist/index.cjs`).
 */
export const getDistIndexPath = (packageRoot: string): string =>
  join(packageRoot, "dist", "index.cjs");

/**
 * Ensures `dist/main.cjs` exists so published-artifact tests fail with an actionable message.
 *
 * @param packageRoot - Absolute path to the `hyper-pm` package root.
 * @param pathExists - Predicate for file existence (defaults to `fs.existsSync`).
 * @throws Error when the bundled CLI file is missing.
 */
export const assertDistMainExists = (
  packageRoot: string,
  pathExists: (p: PathLike) => boolean = existsSync,
): void => {
  const main = getDistMainPath(packageRoot);
  if (!pathExists(main)) {
    throw new Error(
      `Missing ${main}; run "pnpm run build" in apps/hyper-pm (or turbo test) first.`,
    );
  }
};

export type RunBundledCliHelpDeps = {
  /** Spawns a process synchronously (defaults to `spawnSync`). */
  spawnSync: typeof spawnSync;
  /** Node binary to run the CJS bundle (defaults to `process.execPath`). */
  nodeExecutable?: string;
};

/**
 * Runs the published CLI bundle with `--help` via a child process.
 *
 * @param mainCjsPath - Absolute path to `dist/main.cjs`.
 * @param deps - Injected `spawnSync` and optional Node executable.
 * @returns The result object from `spawnSync` with string encoding.
 */
export const runBundledCliHelp = (
  mainCjsPath: string,
  deps: RunBundledCliHelpDeps = {
    spawnSync,
    nodeExecutable: process.execPath,
  },
): SpawnSyncReturns<string> => {
  const node = deps.nodeExecutable ?? process.execPath;
  const opts: SpawnSyncOptionsWithStringEncoding = { encoding: "utf8" };
  return deps.spawnSync(
    node,
    [mainCjsPath, "--help"],
    opts,
  ) as SpawnSyncReturns<string>;
};

/**
 * Sorted list of named exports that must appear on `dist/index.cjs` (public API).
 *
 * @returns Export names in deterministic sort order.
 */
export const getExpectedPublishedExportKeys = (): string[] =>
  ["ExitCode", "openDataBranchWorktree", "runCli", "runGit"].sort();

/**
 * Loads the published CommonJS bundle using `createRequire` rooted at `package.json`.
 *
 * @param packageRoot - Absolute path to the `hyper-pm` package root.
 * @param deps - Injected `createRequire` (defaults to Node's implementation).
 * @returns The `module.exports` object from `dist/index.cjs`.
 */
export const loadPublishedIndexExports = (
  packageRoot: string,
  deps: { createRequire: typeof createRequire } = { createRequire },
): Record<string, unknown> => {
  const req = deps.createRequire(join(packageRoot, "package.json"));
  return req("./dist/index.cjs") as Record<string, unknown>;
};

/**
 * Asserts that `exported` has exactly the expected keys (order-insensitive).
 *
 * @param exported - `module.exports` from the published bundle.
 * @param expectedSorted - Expected key list (typically sorted).
 */
export const assertPublishedExportKeys = (
  exported: Record<string, unknown>,
  expectedSorted: readonly string[],
): void => {
  deepStrictEqual(
    [...Object.keys(exported).sort()],
    [...expectedSorted].sort(),
  );
};

export type PackageIdentity = {
  name: string;
  version: string;
};

/**
 * Reads `name` and `version` from `package.json` at the package root.
 *
 * @param packageRoot - Absolute path to the `hyper-pm` package root.
 * @param readFile - File reader (defaults to `fs.readFileSync`).
 * @returns Package name and version.
 */
export const readPackageIdentity = (
  packageRoot: string,
  readFile: typeof readFileSync = readFileSync,
): PackageIdentity => {
  const raw = readFile(join(packageRoot, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { name: string; version: string };
  return { name: pkg.name, version: pkg.version };
};

export type RunNpmPackIntoDirDeps = {
  execFileSync: (
    file: string,
    args: readonly string[],
    options: ExecFileSyncOptionsWithStringEncoding,
  ) => string;
};

/**
 * Runs `npm pack --pack-destination <destDir>` from `packageRoot` and returns the tarball path.
 *
 * @param packageRoot - Absolute path to the `hyper-pm` package root.
 * @param destDir - Directory that will contain the `.tgz` (must exist).
 * @param deps - Injected `execFileSync` (defaults to Node's implementation).
 * @returns Absolute path to the created tarball.
 * @throws Error when npm prints no tarball name.
 */
export const runNpmPackIntoDir = (
  packageRoot: string,
  destDir: string,
  deps: RunNpmPackIntoDirDeps = {
    execFileSync: (
      file: string,
      args: readonly string[],
      options: ExecFileSyncOptionsWithStringEncoding,
    ) => execFileSync(file, args, options) as string,
  },
): string => {
  const out = deps
    .execFileSync("npm", ["pack", "--pack-destination", destDir], {
      cwd: packageRoot,
      encoding: "utf8",
    })
    .trim();
  const last = out.split("\n").pop()?.trim();
  if (!last) {
    throw new Error("npm pack produced empty output; expected a .tgz filename");
  }
  return isAbsolute(last) ? last : join(destDir, last);
};

export type NpmInstallTarballDeps = RunNpmPackIntoDirDeps;

/**
 * Runs `npm install <tarball>` in `installDir` (creates `node_modules` as npm does).
 *
 * @param tarballAbsolutePath - Absolute path to the `.tgz` from `runNpmPackIntoDir`.
 * @param installDir - Empty or disposable directory used as install prefix.
 * @param deps - Injected `execFileSync` (defaults to Node's implementation).
 */
export const npmInstallTarball = (
  tarballAbsolutePath: string,
  installDir: string,
  deps: NpmInstallTarballDeps = {
    execFileSync: (
      file: string,
      args: readonly string[],
      options: ExecFileSyncOptionsWithStringEncoding,
    ) => execFileSync(file, args, options) as string,
  },
): void => {
  deps.execFileSync("npm", ["install", tarballAbsolutePath], {
    cwd: installDir,
    encoding: "utf8",
  });
};

/**
 * Resolves `dist/main.cjs` inside an installed package under `node_modules`.
 *
 * @param installDir - Directory where `npm install` was run.
 * @param packageName - `name` field from `package.json` (supports scoped names).
 * @returns Absolute path to the installed CLI bundle.
 */
export const pathToInstalledPackageMain = (
  installDir: string,
  packageName: string,
): string => {
  const segments = packageName.split("/");
  return join(installDir, "node_modules", ...segments, "dist", "main.cjs");
};
