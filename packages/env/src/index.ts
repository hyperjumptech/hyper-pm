import { z } from "zod";

/**
 * Zod schema for process environment variables consumed across the monorepo.
 *
 * Kept permissive (mostly optional) so local tooling can run without every key set.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  RESEND_API_KEY: z.string().optional(),
  DB_POOLING_URL: z.string().optional(),
  DB_URL_NON_POOLING: z.string().optional(),
  DB_CERT_BASE_64: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  /** `owner/repo` for GitHub Issues sync (hyper-pm). */
  GITHUB_REPO: z.string().optional(),
  HYPER_PM_AI_API_KEY: z.string().optional(),
  /** Optional override for hyper-pm JSONL event `actor` on CLI mutations. */
  HYPER_PM_ACTOR: z.string().optional(),
  /**
   * Absolute path to the hyper-pm CLI bundle (`main.cjs`) for hyper-pm-mcp and
   * other integrations when auto-resolution from the `hyper-pm` package is insufficient.
   */
  HYPER_PM_CLI_PATH: z.string().optional(),
  /** Bind address for hyper-pm-web (default 127.0.0.1 when unset). */
  HYPER_PM_WEB_HOST: z.string().optional(),
  /** TCP port for hyper-pm-web (coerced from string env). */
  HYPER_PM_WEB_PORT: z.coerce.number().optional(),
  /**
   * Git repo root for hyper-pm-web (`--repo`). When unset, defaults to `process.cwd()`
   * (resolved to an absolute path).
   */
  HYPER_PM_WEB_REPO: z.string().optional(),
  /**
   * Parent directory for disposable worktrees (`--temp-dir`) for hyper-pm-web.
   * When unset, the server creates a unique directory under the OS temp directory
   * and removes it on SIGINT/SIGTERM.
   */
  HYPER_PM_WEB_TEMP_DIR: z.string().optional(),
  /** When set, hyper-pm-web requires `Authorization: Bearer …` on POST /api/run. */
  HYPER_PM_WEB_TOKEN: z.string().optional(),
  /** Standard temp directory override (process manager / OS). */
  TMPDIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Type-safe view of `process.env` for allowed keys. */
export const env: Env = envSchema.parse(process.env);
