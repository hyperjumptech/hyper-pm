/**
 * Applies argv normalizations required before Commander parses flags (for example
 * legacy spellings that would otherwise collide with generated negated-option names).
 *
 * @param argv - Raw argv from the host process or tests (includes `node` and script).
 * @returns A shallow-copied argv list safe to pass to `program.parseAsync`.
 */
export const normalizeRawCliArgv = (argv: string[]): string[] =>
  argv.map((token) => (token === "--no-github" ? "--skip-network" : token));
