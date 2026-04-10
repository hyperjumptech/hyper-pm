import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hyperPmConfigSchema, type HyperPmConfig } from "./hyper-pm-config";

const CONFIG_DIR = ".hyper-pm";
const CONFIG_FILE = "config.json";

/**
 * Resolves the hyper-pm config path inside a repository root.
 *
 * @param repoRoot - Git top-level directory.
 */
export const getHyperPmConfigPath = (repoRoot: string): string => {
  return join(repoRoot, CONFIG_DIR, CONFIG_FILE);
};

/**
 * Reads and validates `HyperPmConfig` from disk, applying command-line overrides.
 *
 * @param repoRoot - Repository root containing `.hyper-pm/`.
 * @param overrides - Optional per-invocation overrides (ticket HYPER-PM-GIT-012).
 */
export const loadHyperPmConfig = async (
  repoRoot: string,
  overrides: Partial<HyperPmConfig> = {},
): Promise<HyperPmConfig> => {
  const raw = await readFile(getHyperPmConfigPath(repoRoot), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const base = hyperPmConfigSchema.parse(parsed);
  const merged = { ...base, ...stripUndefined(overrides) };
  return hyperPmConfigSchema.parse(merged);
};

const stripUndefined = <T extends Record<string, unknown>>(
  obj: T,
): Partial<T> => {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
};
