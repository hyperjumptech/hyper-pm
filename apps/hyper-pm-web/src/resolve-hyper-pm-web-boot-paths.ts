import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type HyperPmWebTempDirResolution = {
  /** Absolute path passed to hyper-pm as `--temp-dir`. */
  tempDirParent: string;
  /**
   * When the server created a disposable directory under the OS temp base,
   * removes it (no-op when `HYPER_PM_WEB_TEMP_DIR` was set explicitly).
   */
  cleanup?: () => Promise<void>;
};

/**
 * Resolves the git repository root for hyper-pm-web: explicit env path, otherwise `process.cwd()`.
 *
 * @param repoFromEnv - Raw `HYPER_PM_WEB_REPO` (may be empty).
 * @param getCwd - Current working directory provider (injectable for tests).
 * @returns Absolute filesystem path.
 */
export const resolveHyperPmWebRepoRoot = (
  repoFromEnv: string | undefined,
  getCwd: () => string = () => process.cwd(),
): string => {
  const t = repoFromEnv?.trim();
  const cwd = resolve(getCwd());
  if (t !== undefined && t.length > 0) {
    return resolve(cwd, t);
  }
  return cwd;
};

/**
 * Resolves the worktree parent directory: uses `HYPER_PM_WEB_TEMP_DIR` when set, otherwise creates a unique directory under the OS temp directory.
 *
 * @param tempFromEnv - Raw `HYPER_PM_WEB_TEMP_DIR` (may be empty).
 * @param deps - Injectable `tmpdir`, `mkdtemp`, `join`, and `rm` (defaults to Node builtins).
 * @returns Absolute path plus optional cleanup for the auto-created directory.
 */
export const resolveHyperPmWebTempDirParent = async (
  tempFromEnv: string | undefined,
  deps: {
    tmpdir: () => string;
    mkdtemp: typeof mkdtemp;
    joinPaths: typeof join;
    rmDir: typeof rm;
  } = {
    tmpdir,
    mkdtemp,
    joinPaths: join,
    rmDir: rm,
  },
): Promise<HyperPmWebTempDirResolution> => {
  const t = tempFromEnv?.trim();
  if (t !== undefined && t.length > 0) {
    return { tempDirParent: resolve(t) };
  }
  const base = deps.joinPaths(deps.tmpdir(), "hyper-pm-web-wt-");
  const tempDirParent = await deps.mkdtemp(base);
  return {
    tempDirParent,
    cleanup: async () => {
      await deps.rmDir(tempDirParent, { recursive: true, force: true });
    },
  };
};
