/**
 * Returns true when the string contains ASCII control characters or DEL.
 *
 * @param s - String to scan.
 * @returns True when any code unit is U+0000–U+001F or U+007F.
 */
const containsAsciiControl = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) {
      return true;
    }
  }
  return false;
};

/**
 * Trims a branch label, strips a leading `refs/heads/` prefix, and rejects empty or control-character names.
 *
 * @param raw - Raw branch name from CLI or event payload.
 * @returns Normalized branch name, or `undefined` when the value should be dropped.
 */
export const normalizeTicketBranchName = (raw: string): string | undefined => {
  let s = raw.trim();
  if (s === "") return undefined;
  if (containsAsciiControl(s)) return undefined;
  const prefix = "refs/heads/";
  if (s.startsWith(prefix)) {
    s = s.slice(prefix.length).trim();
  }
  if (s === "") return undefined;
  if (containsAsciiControl(s)) return undefined;
  return s;
};

/**
 * Normalizes a list of branch strings: validates each entry, deduplicates by first occurrence, preserves order.
 *
 * @param names - Raw branch names (e.g. from repeated CLI flags).
 * @returns Ordered unique normalized names.
 */
export const normalizeTicketBranchListFromStrings = (
  names: readonly string[],
): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const n = normalizeTicketBranchName(raw);
    if (n === undefined || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
};

/**
 * Builds a normalized branch list from a JSON `branches` array in an event payload (non-strings skipped).
 *
 * @param value - Payload field value (typically `unknown` from `Record<string, unknown>`).
 * @returns Normalized ordered unique branch names; empty array when `value` is not an array.
 */
export const normalizeTicketBranchListFromPayloadValue = (
  value: unknown,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      strings.push(item);
    }
  }
  return normalizeTicketBranchListFromStrings(strings);
};
