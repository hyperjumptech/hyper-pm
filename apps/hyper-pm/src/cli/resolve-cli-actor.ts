import { userInfo as defaultUserInfo } from "node:os";
import type { runGit as runGitFn } from "../git/run-git";
import { runGit as defaultRunGit } from "../git/run-git";

/** Injectable collaborators for {@link resolveCliActor}. */
export type ResolveCliActorDeps = {
  runGit: typeof runGitFn;
  userInfo: () => ReturnType<typeof defaultUserInfo>;
};

/**
 * Resolves the audit `actor` string for local CLI mutations.
 * Precedence: explicit CLI `--actor` → `HYPER_PM_ACTOR` → `git config` name/email at * `repoRoot` → OS username prefixed with `local:`.
 *
 * @param params - Repository root and optional overrides from flag and env.
 * @param deps - Injectable git runner and `userInfo` (defaults to production).
 * @returns Non-empty actor label for the durable event `actor` field.
 */
export const resolveCliActor = async (
  params: {
    repoRoot: string;
    cliActor?: string;
    envActor?: string;
  },
  deps: ResolveCliActorDeps = {
    runGit: defaultRunGit,
    userInfo: defaultUserInfo,
  },
): Promise<string> => {
  const fromFlag = params.cliActor?.trim();
  if (fromFlag) return fromFlag;
  const fromEnv = params.envActor?.trim();
  if (fromEnv) return fromEnv;

  try {
    const { stdout: nameRaw } = await deps.runGit(params.repoRoot, [
      "config",
      "user.name",
    ]);
    const { stdout: emailRaw } = await deps.runGit(params.repoRoot, [
      "config",
      "user.email",
    ]);
    const name = nameRaw.trim();
    const email = emailRaw.trim();
    if (name && email) {
      return `cli:${name} <${email}>`;
    }
    if (name) {
      return `cli:${name}`;
    }
    if (email) {
      return `cli:${email}`;
    }
  } catch {
    // Missing or invalid git config — fall back below.
  }

  const username = deps.userInfo().username;
  return `local:${username}`;
};
