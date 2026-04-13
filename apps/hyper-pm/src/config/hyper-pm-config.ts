import { z } from "zod";

/**
 * On-disk configuration written under `.hyper-pm/config.json` in the primary worktree.
 */
export const hyperPmConfigSchema = z.object({
  schema: z.literal(1),
  dataBranch: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  /** `off` disables `sync --with-github`. `outbound` and `full` are equivalent for that flag (full mirror). */
  sync: z.enum(["off", "outbound", "full"]).default("outbound"),
  githubRepo: z.string().optional(),
  issueMapping: z.enum(["ticket", "story", "epic"]).default("ticket"),
});

export type HyperPmConfig = z.infer<typeof hyperPmConfigSchema>;

/**
 * Config for the GitHub phases of `sync --with-github`.
 * Forces `sync: "full"` so outbound, inbound, and PR activity always run together.
 *
 * @param cfg - Merged on-disk config (caller must reject `sync: "off"` before calling).
 * @returns Copy of `cfg` with `sync` set to `"full"`.
 */
export const hyperPmConfigForSyncWithGithub = (
  cfg: HyperPmConfig,
): HyperPmConfig => ({
  ...cfg,
  sync: "full",
});
