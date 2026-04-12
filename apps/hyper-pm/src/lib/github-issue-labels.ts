import { normalizeTicketLabelList } from "./ticket-planning-fields";

/** GitHub issue labels reserved for hyper-pm routing (case-insensitive match). */
const RESERVED_LOWER = new Set(["hyper-pm", "ticket"]);

/**
 * GitHub allows label names up to this length; longer names are omitted from outbound sync.
 *
 * @see https://docs.github.com/en/rest/issues/labels
 */
export const GITHUB_LABEL_NAME_MAX_LENGTH = 50;

/**
 * Returns whether a label name is reserved for hyper-pm (system) labels on synced issues.
 *
 * @param name - GitHub label name (any casing).
 */
export const isReservedHyperPmGithubLabel = (name: string): boolean => {
  return RESERVED_LOWER.has(name.trim().toLowerCase());
};

/**
 * Extracts a label name from one GitHub API `labels` entry (string or `{ name }`).
 *
 * @param entry - One element from `issue.labels`.
 */
export const labelNameFromGithubLabelEntry = (
  entry: unknown,
): string | undefined => {
  if (typeof entry === "string") {
    const t = entry.trim();
    return t === "" ? undefined : t;
  }
  if (typeof entry === "object" && entry !== null && "name" in entry) {
    const n = (entry as { name?: unknown }).name;
    if (typeof n !== "string") return undefined;
    const t = n.trim();
    return t === "" ? undefined : t;
  }
  return undefined;
};

/**
 * Returns non-reserved, normalized ticket labels from a GitHub issue `labels` array.
 *
 * @param labels - `issue.labels` from the GitHub REST API.
 */
export const ticketLabelsFromGithubIssueLabels = (
  labels: unknown,
): string[] => {
  if (!Array.isArray(labels)) {
    return [];
  }
  const raw: string[] = [];
  for (const item of labels) {
    const n = labelNameFromGithubLabelEntry(item);
    if (n === undefined) continue;
    if (isReservedHyperPmGithubLabel(n)) continue;
    raw.push(n);
  }
  return normalizeTicketLabelList(raw);
};

/**
 * Builds the `labels` array for `issues.create` / `issues.update`: reserved labels plus
 * normalized ticket labels (deduped, length-filtered for GitHub limits).
 *
 * @param ticketLabels - Optional labels from the ticket projection row.
 */
export const mergeOutboundGithubIssueLabelsForTicket = (
  ticketLabels: readonly string[] | undefined,
): string[] => {
  const base = ["hyper-pm", "ticket"];
  const seen = new Set<string>(base.map((x) => x.toLowerCase()));
  const out = [...base];
  const norm = normalizeTicketLabelList(ticketLabels ?? []);
  for (const lab of norm) {
    if (lab.length > GITHUB_LABEL_NAME_MAX_LENGTH) {
      continue;
    }
    const low = lab.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(lab);
  }
  return out;
};
