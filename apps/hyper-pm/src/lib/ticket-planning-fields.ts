/**
 * Allowed `priority` values on ticket event payloads and {@link TicketRecord}.
 */
export type TicketPriority = "low" | "medium" | "high" | "urgent";

/**
 * Allowed `size` values on ticket event payloads and {@link TicketRecord}.
 */
export type TicketSize = "xs" | "s" | "m" | "l" | "xl";

const PRIORITY_SET: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
  "urgent",
]);

const SIZE_SET: ReadonlySet<string> = new Set(["xs", "s", "m", "l", "xl"]);

/**
 * Parses a CLI `--priority` token into a ticket priority.
 *
 * @param raw - Trimmed or untrimmed flag value.
 * @returns The priority when `raw` matches a known literal (case-insensitive); otherwise `undefined`.
 */
export const tryParseTicketPriority = (
  raw: string,
): TicketPriority | undefined => {
  const t = raw.trim().toLowerCase();
  if (PRIORITY_SET.has(t)) {
    return t as TicketPriority;
  }
  return undefined;
};

/**
 * Parses a CLI `--size` token into a ticket size.
 *
 * @param raw - Trimmed or untrimmed flag value.
 * @returns The size when `raw` matches a known literal (case-insensitive); otherwise `undefined`.
 */
export const tryParseTicketSize = (raw: string): TicketSize | undefined => {
  const t = raw.trim().toLowerCase();
  if (SIZE_SET.has(t)) {
    return t as TicketSize;
  }
  return undefined;
};

/**
 * Normalizes a list of label strings: trim, drop empties, dedupe by first occurrence.
 *
 * @param labels - Raw label strings (e.g. from CLI).
 * @returns Ordered unique non-empty labels.
 */
export const normalizeTicketLabelList = (
  labels: readonly string[],
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const t = raw.trim();
    if (t === "") continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
};

/**
 * Returns whether two label lists are the same after {@link normalizeTicketLabelList}.
 *
 * @param a - First list (or `undefined` for no labels).
 * @param b - Second list (or `undefined` for no labels).
 */
export const ticketLabelListsEqual = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean => {
  const an = normalizeTicketLabelList(a ?? []);
  const bn = normalizeTicketLabelList(b ?? []);
  if (an.length !== bn.length) {
    return false;
  }
  return an.every((x, i) => x === bn[i]);
};

/**
 * Parses `labels` from an event payload value (array of strings).
 *
 * @param value - Payload `labels` value.
 * @returns Normalized label list, or `undefined` when `value` is not a usable string array.
 */
export const ticketLabelsFromPayloadValue = (
  value: unknown,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const strings: string[] = [];
  for (const x of value) {
    if (typeof x !== "string") return undefined;
    strings.push(x);
  }
  return normalizeTicketLabelList(strings);
};

/**
 * Reads optional `priority` from a create/update payload: set, clear, or absent.
 *
 * @param payload - Event payload.
 * @returns `null` when key is present and null (clear); a priority when a valid string; `undefined` when absent or invalid.
 */
export const readTicketPriorityPatch = (
  payload: Record<string, unknown>,
): TicketPriority | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, "priority")) {
    return undefined;
  }
  const v = payload["priority"];
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return tryParseTicketPriority(v);
};

/**
 * Reads optional `size` from a create/update payload: set, clear, or absent.
 *
 * @param payload - Event payload.
 * @returns `null` when key is present and null (clear); a size when a valid string; `undefined` when absent or invalid.
 */
export const readTicketSizePatch = (
  payload: Record<string, unknown>,
): TicketSize | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, "size")) {
    return undefined;
  }
  const v = payload["size"];
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return tryParseTicketSize(v);
};

/**
 * Reads optional `estimate` from a create/update payload: set, clear, or absent.
 *
 * @param payload - Event payload.
 * @returns `null` when key is present and null (clear); a non-negative finite number when valid; `undefined` when absent or invalid.
 */
export const readTicketEstimatePatch = (
  payload: Record<string, unknown>,
): number | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, "estimate")) {
    return undefined;
  }
  const v = payload["estimate"];
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    return undefined;
  }
  return v;
};

/**
 * Returns whether `value` is a finite non-negative number suitable for `estimate`.
 *
 * @param value - Raw payload value.
 */
export const isValidTicketEstimate = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
};

/**
 * Reads optional `startWorkAt` / `targetFinishAt` ISO string from a payload: set, clear, or absent.
 *
 * @param payload - Event payload.
 * @param key - Field name (`startWorkAt` or `targetFinishAt`).
 * @returns `null` when key is present and null (clear); a trimmed ISO string when parseable; `undefined` when absent or invalid.
 */
export const readTicketIsoInstantPatch = (
  payload: Record<string, unknown>,
  key: "startWorkAt" | "targetFinishAt",
): string | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(payload, key)) {
    return undefined;
  }
  const v = payload[key];
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t === "") return undefined;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return undefined;
  return t;
};

/**
 * Sort rank for priority ascending (lower = smaller priority weight); unknown sorts last in asc.
 *
 * @param p - Ticket priority, or `undefined` when unset.
 */
export const ticketPrioritySortRank = (
  p: TicketPriority | undefined,
): number => {
  if (p === undefined) return Number.POSITIVE_INFINITY;
  const order: Record<TicketPriority, number> = {
    low: 0,
    medium: 1,
    high: 2,
    urgent: 3,
  };
  return order[p];
};

/**
 * Sort rank for size ascending; unknown sorts last in asc.
 *
 * @param s - Ticket size, or `undefined` when unset.
 */
export const ticketSizeSortRank = (s: TicketSize | undefined): number => {
  if (s === undefined) return Number.POSITIVE_INFINITY;
  const order: Record<TicketSize, number> = {
    xs: 0,
    s: 1,
    m: 2,
    l: 3,
    xl: 4,
  };
  return order[s];
};
