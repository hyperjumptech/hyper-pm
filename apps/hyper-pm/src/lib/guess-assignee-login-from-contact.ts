import { normalizeGithubLogin } from "./github-assignee";

const GITHUB_NOREPLY_DOMAIN = "users.noreply.github.com";

/**
 * Returns true when `s` looks like a valid GitHub username after normalization
 * (alphanumeric and non-leading/trailing single hyphens, length 1–39).
 *
 * @param s - Already lowercased candidate string.
 * @returns Whether the string matches GitHub's username shape closely enough for CLI hints.
 */
export const looksLikeGithubUsername = (s: string): boolean => {
  if (s.length < 1 || s.length > 39) return false;
  if (s.startsWith("-") || s.endsWith("-")) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
};

/**
 * Parses a GitHub `users.noreply.github.com` email and returns the embedded login when present.
 *
 * @param email - Full email address (trimmed by caller recommended).
 * @returns Normalized login, or `undefined` when the address is not a recognized noreply form.
 */
export const githubLoginFromNoreplyEmail = (
  email: string,
): string | undefined => {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return undefined;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (domain !== GITHUB_NOREPLY_DOMAIN) return undefined;
  if (/^\d+$/.test(local)) return undefined;
  const parts = local.split("+");
  const rawLogin: string =
    parts.length >= 2 ? (parts[parts.length - 1] ?? local) : local;
  const n = normalizeGithubLogin(rawLogin);
  if (n === "" || !looksLikeGithubUsername(n)) return undefined;
  return n;
};

/**
 * Guesses a GitHub login from a generic email local-part (before `@`), ignoring plus-tags.
 *
 * @param email - Full email address.
 * @returns Normalized login when the derived local-part looks like a GitHub username.
 */
export const githubLoginGuessFromGenericEmail = (
  email: string,
): string | undefined => {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return undefined;
  const localFull = trimmed.slice(0, at);
  const baseLocal = localFull.split("+")[0] ?? "";
  const n = normalizeGithubLogin(baseLocal);
  if (n === "" || !looksLikeGithubUsername(n)) return undefined;
  return n;
};

/**
 * Suggests a GitHub login for ticket assignment from a person's display name and email.
 * Prefer parsing GitHub noreply addresses; otherwise use the email local-part; finally try the name.
 *
 * @param name - Commit or form display name (may be empty).
 * @param email - Email address (required for meaningful guesses).
 * @returns Normalized login when a plausible guess exists.
 */
export const guessGithubLoginFromContact = (
  name: string,
  email: string,
): string | undefined => {
  const e = email.trim();
  if (e === "") return undefined;
  const fromNoreply = githubLoginFromNoreplyEmail(e);
  if (fromNoreply !== undefined) return fromNoreply;
  const fromGeneric = githubLoginGuessFromGenericEmail(e);
  if (fromGeneric !== undefined) return fromGeneric;
  const fromName = normalizeGithubLogin(name);
  if (fromName !== "" && looksLikeGithubUsername(fromName)) return fromName;
  return undefined;
};
