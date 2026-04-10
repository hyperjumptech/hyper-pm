/**
 * Outcome of spawning the hyper-pm CLI (aggregated streams and process result).
 */
export type RunHyperPmCliResult = {
  /** Numeric exit code, or `null` when the process was killed without a code. */
  exitCode: number | null;
  /** Aggregated stdout (UTF-8). */
  stdout: string;
  /** Aggregated stderr (UTF-8). */
  stderr: string;
  /** Signal name when the process exited via signal; otherwise `null`. */
  signal: NodeJS.Signals | null;
};
