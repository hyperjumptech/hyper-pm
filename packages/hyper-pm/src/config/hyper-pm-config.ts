import { z } from "zod";

/**
 * On-disk configuration written under `.hyper-pm/config.json` in the primary worktree.
 */
export const hyperPmConfigSchema = z.object({
  schema: z.literal(1),
  dataBranch: z.string().min(1),
  remote: z.string().min(1).default("origin"),
  sync: z.enum(["off", "outbound", "full"]).default("outbound"),
  githubRepo: z.string().optional(),
  issueMapping: z.enum(["ticket", "story", "epic"]).default("ticket"),
});

export type HyperPmConfig = z.infer<typeof hyperPmConfigSchema>;
