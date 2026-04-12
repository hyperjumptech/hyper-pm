const FORBIDDEN_EXACT = new Set(["--repo", "--temp-dir", "--format"]);

const FORBIDDEN_PREFIXES = ["--repo=", "--temp-dir=", "--format="] as const;

/**
 * Ensures client-supplied argv cannot override server-controlled global flags.
 *
 * @param argv - Token list passed to hyper-pm after globals are injected.
 * @throws Error when a forbidden token appears.
 */
export const assertArgvNoForcedCliFlags = (argv: readonly string[]): void => {
  for (const t of argv) {
    if (FORBIDDEN_EXACT.has(t)) {
      throw new Error(
        `argv must not include ${t} (server injects repo, temp dir, and JSON format)`,
      );
    }
    for (const p of FORBIDDEN_PREFIXES) {
      if (t.startsWith(p)) {
        throw new Error(
          `argv must not include ${p}… flags (server injects repo, temp dir, and JSON format)`,
        );
      }
    }
  }
};
