/**
 * Attempts to parse CLI stdout as JSON (after trim). Used for machine-readable hyper-pm output.
 *
 * @param stdout - Raw stdout string from the child process.
 * @returns Parsed value when valid JSON; otherwise `null`.
 */
export const tryParseStdoutJson = (stdout: string): unknown | null => {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};
