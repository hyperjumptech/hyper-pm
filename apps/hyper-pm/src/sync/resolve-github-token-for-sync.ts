import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Injectable `execFile` used by {@link resolveGithubTokenForSync}. */
export type ExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string },
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

/**
 * Resolves a GitHub REST API token for `hyper-pm sync`.
 *
 * Precedence: non-empty trimmed `envToken`, else stdout of `gh auth token` in `cwd`.
 * Returns `null` when no env token and `gh` is missing, not logged in, errors, or prints nothing.
 *
 * @param params - Env token and optional subprocess injector.
 * @returns Bearer token string, or `null` if neither source yields a token.
 */
export const resolveGithubTokenForSync = async (params: {
  envToken: string | undefined;
  cwd: string;
  execFileFn?: ExecFileFn;
}): Promise<string | null> => {
  const trimmedEnv = params.envToken?.trim();
  if (trimmedEnv) {
    return trimmedEnv;
  }

  const runner = params.execFileFn ?? ((f, a, o) => execFileAsync(f, a, o));

  try {
    const result = await runner("gh", ["auth", "token"], { cwd: params.cwd });
    const stdoutVal = result.stdout;
    const out =
      typeof stdoutVal === "string" ? stdoutVal : stdoutVal.toString("utf8");
    const token = out.trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
};
