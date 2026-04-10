import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HyperPmConfig } from "./hyper-pm-config";
import { getHyperPmConfigPath } from "./load-config";

/**
 * Persists hyper-pm config next to the primary worktree (never on the data branch path).
 *
 * @param repoRoot - Git top-level directory.
 * @param config - Validated configuration object.
 */
export const saveHyperPmConfig = async (
  repoRoot: string,
  config: HyperPmConfig,
): Promise<void> => {
  const target = getHyperPmConfigPath(repoRoot);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
};
