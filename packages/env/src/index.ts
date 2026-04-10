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
  /** Standard temp directory override (process manager / OS). */
  TMPDIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Type-safe view of `process.env` for allowed keys. */
export const env: Env = envSchema.parse(process.env);
