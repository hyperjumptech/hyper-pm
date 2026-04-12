import { guessGithubLoginFromContact } from "../lib/guess-assignee-login-from-contact";
import { runGit } from "./run-git";

/** One unique commit author row for UI / CLI consumers. */
export type RepoCommitAuthor = {
  name: string;
  email: string;
  /** Best-effort GitHub login guess from name/email (omit when none). */
  loginGuess?: string;
};

/**
 * Lists unique commit authors (by email, most recently active first) for the repository.
 *
 * @param repoRoot - Git repository root.
 * @param git - Git runner (injectable for tests).
 * @returns Deduplicated authors; empty when there is no history or git errors.
 */
export const listRepoCommitAuthors = async (
  repoRoot: string,
  git: typeof runGit,
): Promise<RepoCommitAuthor[]> => {
  try {
    const { stdout } = await git(repoRoot, [
      "-c",
      "log.showSignature=false",
      "log",
      "--all",
      "--format=%an%x1f%ae",
    ]);
    if (stdout === "") return [];
    const lines = stdout.split("\n").filter((l) => l.length > 0);
    const seenEmail = new Set<string>();
    const out: RepoCommitAuthor[] = [];
    for (const line of lines) {
      const sep = line.indexOf("\x1f");
      if (sep <= 0) continue;
      const name = line.slice(0, sep).trim();
      const email = line.slice(sep + 1).trim();
      if (email === "") continue;
      const key = email.toLowerCase();
      if (seenEmail.has(key)) continue;
      seenEmail.add(key);
      const loginGuess = guessGithubLoginFromContact(name, email);
      out.push(
        loginGuess !== undefined
          ? { name, email, loginGuess }
          : { name, email },
      );
    }
    return out;
  } catch {
    return [];
  }
};
