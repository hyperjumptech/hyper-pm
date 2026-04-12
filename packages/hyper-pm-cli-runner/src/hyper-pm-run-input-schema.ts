import { z } from "zod";

/**
 * Zod schema for programmatic hyper-pm runs (MCP tool, web API, etc.): mirrors global CLI flags plus subcommand argv.
 */
export const hyperPmRunInputSchema = z.object({
  /** Subcommand tokens only, e.g. `["epic", "read"]` or `["doctor"]`. */
  argv: z.array(z.string()),
  /** Working directory for the child process (defaults to `process.cwd()` in the runner). */
  cwd: z.string().optional(),
  /** Passed as `--repo` when set. */
  repo: z.string().optional(),
  /** Passed as `--temp-dir` when set. */
  tempDir: z.string().optional(),
  /** Passed as `--actor` when set. */
  actor: z.string().optional(),
  /** Passed as `--github-repo` when set. */
  githubRepo: z.string().optional(),
  /** Passed as `--data-branch` when set. */
  dataBranch: z.string().optional(),
  /** Passed as `--remote` when set. */
  remote: z.string().optional(),
  /** Passed as `--sync` when set. */
  sync: z.enum(["off", "outbound", "full"]).optional(),
  /** When true, appends `--keep-worktree`. */
  keepWorktree: z.boolean().optional(),
});

/** Parsed input for spawning the hyper-pm CLI. */
export type HyperPmRunInput = z.infer<typeof hyperPmRunInputSchema>;
