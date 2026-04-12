import { spawn, type ChildProcess } from "node:child_process";
import { buildHyperPmCliArgv } from "./build-hyper-pm-cli-argv";
import type { HyperPmRunInput } from "./hyper-pm-run-input-schema";
import { resolveHyperPmMainPath } from "./resolve-hyper-pm-main-path";
import type { RunHyperPmCliResult } from "./run-hyper-pm-cli-types";

/**
 * Spawns the hyper-pm CLI (`dist/main.cjs`) with Node, collects stdout/stderr, and resolves when the process exits.
 *
 * @param input - Validated tool input (subcommand argv and optional global flags).
 * @param deps - Injectable path resolution, `process.execPath`, spawn, and default cwd.
 * @returns Aggregated streams and exit metadata.
 */
export const runHyperPmCli = async (
  input: HyperPmRunInput,
  deps: {
    resolveMainPath: () => string;
    execPath: string;
    spawnProcess: (
      command: string,
      args: readonly string[],
      options: { cwd: string; windowsHide: boolean },
    ) => ChildProcess;
    defaultCwd: () => string;
  } = {
    resolveMainPath: () => resolveHyperPmMainPath(),
    execPath: process.execPath,
    spawnProcess: spawn,
    defaultCwd: () => process.cwd(),
  },
): Promise<RunHyperPmCliResult> => {
  const mainPath = deps.resolveMainPath();
  const argv = buildHyperPmCliArgv(input);
  const cwd = input.cwd ?? deps.defaultCwd();

  return new Promise((resolve, reject) => {
    const child = deps.spawnProcess(deps.execPath, [mainPath, ...argv], {
      cwd,
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (err: Error) => {
      reject(err);
    });

    child.on("close", (code, signal) => {
      resolve({
        exitCode: code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        signal: signal ?? null,
      });
    });
  });
};
