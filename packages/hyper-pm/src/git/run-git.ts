import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Runs a git subprocess with arguments and returns trimmed stdout/stderr.
 *
 * @param cwd - Repository or working directory passed to git `-C` behavior via `cwd` option.
 * @param args - Git CLI arguments (without the `git` prefix).
 * @param deps - Injectable `execFile` implementation (defaults to Node's promisified helper).
 */
export const runGit = async (
  cwd: string,
  args: string[],
  deps: {
    execFileFn?: (
      file: string,
      args: string[],
      options: { cwd: string },
    ) => Promise<{ stdout: string; stderr: string }>;
  } = {},
): Promise<{ stdout: string; stderr: string }> => {
  const runner = deps.execFileFn ?? ((f, a, o) => execFileAsync(f, a, o));
  const result = await runner("git", args, { cwd });
  const stdoutVal = result.stdout as string | Buffer;
  const stderrVal = result.stderr as string | Buffer;
  const out =
    typeof stdoutVal === "string" ? stdoutVal : stdoutVal.toString("utf8");
  const err =
    typeof stderrVal === "string" ? stderrVal : stderrVal.toString("utf8");
  return {
    stdout: out.trim(),
    stderr: err.trim(),
  };
};
