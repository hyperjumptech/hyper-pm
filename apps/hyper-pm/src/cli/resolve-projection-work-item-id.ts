import { normalizeTicketDependsOnIds } from "../lib/ticket-depends-on";
import type { Projection } from "../storage/projection";
import {
  nextEpicNumberForCreate,
  nextStoryNumberForCreate,
  nextTicketNumberForCreate,
  readOptionalPositiveIntegerFromPayload,
} from "../storage/projection";

/**
 * Returns true when `raw` is non-empty after trim and contains only ASCII digits.
 *
 * @param raw - User-provided token (e.g. CLI `--id` value).
 */
export const isDigitOnlyWorkItemRef = (raw: string): boolean =>
  /^\d+$/.test(raw.trim());

/**
 * Resolves an epic ULID: exact id match first, then a unique epic with that `number`.
 *
 * @param projection - Replayed projection.
 * @param raw - Trimmed or untrimmed id or digit-only number.
 * @returns The epic id when uniquely resolved; otherwise `undefined`.
 */
export const resolveEpicId = (
  projection: Projection,
  raw: string,
): string | undefined => {
  const t = raw.trim();
  if (t === "") return undefined;
  if (projection.epics.has(t)) return t;
  if (!isDigitOnlyWorkItemRef(t)) return undefined;
  const n = Number(t);
  const hits = [...projection.epics.values()].filter((e) => e.number === n);
  if (hits.length !== 1) return undefined;
  return hits[0]!.id;
};

/**
 * Resolves a story ULID: exact id match first, then a unique story with that `number`.
 *
 * @param projection - Replayed projection.
 * @param raw - Trimmed or untrimmed id or digit-only number.
 * @returns The story id when uniquely resolved; otherwise `undefined`.
 */
export const resolveStoryId = (
  projection: Projection,
  raw: string,
): string | undefined => {
  const t = raw.trim();
  if (t === "") return undefined;
  if (projection.stories.has(t)) return t;
  if (!isDigitOnlyWorkItemRef(t)) return undefined;
  const n = Number(t);
  const hits = [...projection.stories.values()].filter((s) => s.number === n);
  if (hits.length !== 1) return undefined;
  return hits[0]!.id;
};

/**
 * Resolves a ticket ULID: exact id match first, then a unique ticket with that `number`.
 *
 * @param projection - Replayed projection.
 * @param raw - Trimmed or untrimmed id or digit-only number.
 * @returns The ticket id when uniquely resolved; otherwise `undefined`.
 */
export const resolveTicketId = (
  projection: Projection,
  raw: string,
): string | undefined => {
  const t = raw.trim();
  if (t === "") return undefined;
  if (projection.tickets.has(t)) return t;
  if (!isDigitOnlyWorkItemRef(t)) return undefined;
  const n = Number(t);
  const hits = [...projection.tickets.values()].filter((x) => x.number === n);
  if (hits.length !== 1) return undefined;
  return hits[0]!.id;
};

/**
 * Maps dependency tokens to ticket ids using the same resolution rules as `resolveTicketId`,
 * then applies {@link normalizeTicketDependsOnIds}.
 *
 * @param projection - Replayed projection used for resolution.
 * @param tokens - Raw CLI tokens (may include whitespace or duplicates).
 * @returns Normalized prerequisite ticket ids.
 */
export const resolveTicketDependsOnTokensToIds = (
  projection: Projection,
  tokens: readonly string[],
): string[] => {
  const mapped = tokens.map((raw) => {
    const t = raw.trim();
    if (t === "") return "";
    if (projection.tickets.has(t)) return t;
    if (!isDigitOnlyWorkItemRef(t)) return t;
    const hit = resolveTicketId(projection, t);
    return hit ?? t;
  });
  return normalizeTicketDependsOnIds(mapped);
};

/** Work item kind whose `number` sequence is validated on create. */
export type CreateWorkItemKind = "epic" | "story" | "ticket";

/**
 * Ensures a `*Created` payload carries `number` equal to the next expected value for this head projection.
 *
 * @param projection - State immediately before appending the create event.
 * @param kind - Which counter namespace is being appended.
 * @param payload - Payload about to be written (must include valid `number`).
 */
export const assertCreatePayloadUsesExpectedHeadNumber = (
  projection: Projection,
  kind: CreateWorkItemKind,
  payload: Record<string, unknown>,
): void => {
  const n = readOptionalPositiveIntegerFromPayload(payload, "number");
  const expected =
    kind === "epic"
      ? nextEpicNumberForCreate(projection)
      : kind === "story"
        ? nextStoryNumberForCreate(projection)
        : nextTicketNumberForCreate(projection);
  if (n !== expected) {
    const got = n === undefined ? "missing" : String(n);
    throw new Error(
      `Invalid ${kind} number for this data branch: expected ${String(expected)}, got ${got}.`,
    );
  }
};
