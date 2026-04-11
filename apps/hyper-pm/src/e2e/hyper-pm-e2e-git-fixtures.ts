import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runGit } from "../git/run-git";

/**
 * Runs `git` in `cwd` with arguments, returning trimmed stdout.
 *
 * @param cwd - Working tree root.
 * @param args - Git CLI arguments after `git`.
 * @returns Trimmed standard output from git.
 */
export const git = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await runGit(cwd, args);
  return stdout;
};

/**
 * Creates a new git repository with an initial commit on `main`.
 *
 * @param parentDir - Directory that will contain a `repo` subdirectory.
 * @returns Absolute path to the repository root.
 */
export const createGitRepoWithInitialCommit = async (
  parentDir: string,
): Promise<string> => {
  const root = join(parentDir, "repo");
  await mkdir(root, { recursive: true });
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "hyper-pm-e2e@example.com"]);
  await git(root, ["config", "user.name", "hyper-pm e2e"]);
  const readme = join(root, "README.md");
  await writeFile(readme, "# fixture\n", "utf8");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "init"]);
  return root;
};

/**
 * Sleeps for merge tests so `events/.../part-<Date.now()>.jsonl` shards differ between mutations.
 *
 * @param ms - Milliseconds to wait.
 * @returns A promise that resolves after `ms`.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
