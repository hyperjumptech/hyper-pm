import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { env } from "@workspace/env";

const defaultRequire = createRequire(import.meta.url);

/**
 * Resolves the absolute path to hyper-pm's bundled CLI entry (`dist/main.cjs`).
 *
 * Uses `require.resolve("hyper-pm")` (the package entry under `src/`) and walks to `dist/main.cjs`, because `hyper-pm` does not export `package.json`.
 *
 * @param deps - `HYPER_PM_CLI_PATH` override, package entry resolution, and `path.join` (injectable for tests).
 * @returns Absolute filesystem path to the hyper-pm main bundle.
 */
export const resolveHyperPmMainPath = (
  deps: {
    env: Pick<typeof env, "HYPER_PM_CLI_PATH">;
    resolvePackageEntry: (packageName: string) => string;
    joinPaths: typeof join;
    dirnamePath: typeof dirname;
  } = {
    env,
    resolvePackageEntry: (packageName: string) =>
      defaultRequire.resolve(packageName),
    joinPaths: join,
    dirnamePath: dirname,
  },
): string => {
  const override = deps.env.HYPER_PM_CLI_PATH;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  const entryPath = deps.resolvePackageEntry("hyper-pm");
  const packageRoot = deps.dirnamePath(entryPath);
  return deps.joinPaths(packageRoot, "..", "dist", "main.cjs");
};
