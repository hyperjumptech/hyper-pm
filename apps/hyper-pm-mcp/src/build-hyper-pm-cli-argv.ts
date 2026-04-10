import type { HyperPmRunInput } from "./hyper-pm-run-input-schema";

/**
 * Builds argv tokens passed to `hyper-pm` after the script path: always includes `--format json`, then optional globals, then subcommand argv.
 *
 * @param input - Validated MCP tool input.
 * @returns Argument list suitable for `spawn(execPath, [mainCjs, ...args])`.
 */
export const buildHyperPmCliArgv = (input: HyperPmRunInput): string[] => {
  const args: string[] = ["--format", "json"];
  if (input.repo !== undefined) {
    args.push("--repo", input.repo);
  }
  if (input.tempDir !== undefined) {
    args.push("--temp-dir", input.tempDir);
  }
  if (input.actor !== undefined) {
    args.push("--actor", input.actor);
  }
  if (input.githubRepo !== undefined) {
    args.push("--github-repo", input.githubRepo);
  }
  if (input.dataBranch !== undefined) {
    args.push("--data-branch", input.dataBranch);
  }
  if (input.remote !== undefined) {
    args.push("--remote", input.remote);
  }
  if (input.sync !== undefined) {
    args.push("--sync", input.sync);
  }
  if (input.keepWorktree === true) {
    args.push("--keep-worktree");
  }
  args.push(...input.argv);
  return args;
};
