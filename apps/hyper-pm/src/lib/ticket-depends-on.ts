import type { Projection } from "../storage/projection";

/**
 * Normalizes dependency ids: trim, drop empties, dedupe by first occurrence (order preserved).
 *
 * @param ids - Raw ticket id strings (e.g. from CLI).
 * @returns Ordered unique non-empty ids.
 */
export const normalizeTicketDependsOnIds = (
  ids: readonly string[],
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const t = raw.trim();
    if (t === "") continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
};

/**
 * Returns whether two dependency lists are equivalent after normalization.
 *
 * @param a - First list, or `undefined` when unset.
 * @param b - Second list, or `undefined` when unset.
 */
export const ticketDependsOnListsEqual = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean => {
  const an = normalizeTicketDependsOnIds(a ?? []);
  const bn = normalizeTicketDependsOnIds(b ?? []);
  if (an.length !== bn.length) return false;
  return an.every((x, i) => x === bn[i]);
};

/**
 * Parses strict `dependsOn` from an event payload: every element must be a string.
 *
 * @param value - Payload `dependsOn` value.
 * @returns Normalized id list, or `undefined` when not a string array.
 */
export const parseTicketDependsOnFromPayloadValue = (
  value: unknown,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const strings: string[] = [];
  for (const x of value) {
    if (typeof x !== "string") return undefined;
    strings.push(x);
  }
  return normalizeTicketDependsOnIds(strings);
};

/**
 * Parses `depends_on` from GitHub fence JSON: keeps only string elements, then normalizes.
 *
 * @param value - Fence metadata value for `depends_on`.
 * @returns Normalized list, or `undefined` when `value` is not an array.
 */
export const parseTicketDependsOnFromFenceValue = (
  value: unknown,
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const strings: string[] = [];
  for (const x of value) {
    if (typeof x === "string") strings.push(x);
  }
  return normalizeTicketDependsOnIds(strings);
};

export type TicketDependsOnLookup = (
  ticketId: string,
) => readonly string[] | undefined;

/**
 * Returns true if assigning `nextDependsOn` to `fromTicketId` would create a cycle,
 * using `successorsFor` to read each ticket's outgoing dependency edges (including the draft for `fromTicketId`).
 *
 * @param fromTicketId - Ticket receiving the new `dependsOn` list.
 * @param nextDependsOn - Proposed prerequisite ids (already normalized, no self — callers should reject self separately).
 * @param successorsFor - Returns dependency ids for a ticket id; for `fromTicketId` must return `nextDependsOn`.
 */
export const wouldTicketDependsOnCreateCycle = (params: {
  fromTicketId: string;
  nextDependsOn: readonly string[];
  successorsFor: TicketDependsOnLookup;
}): boolean => {
  const { fromTicketId, nextDependsOn, successorsFor } = params;

  const dfsFromPrerequisite = (start: string): boolean => {
    const stack: string[] = [start];
    const visited = new Set<string>();
    while (stack.length > 0) {
      const node = stack.pop() as string;
      if (node === fromTicketId) return true;
      if (visited.has(node)) continue;
      visited.add(node);
      const next = successorsFor(node) ?? [];
      for (let i = next.length - 1; i >= 0; i -= 1) {
        stack.push(next[i] as string);
      }
    }
    return false;
  };

  for (const p of nextDependsOn) {
    if (dfsFromPrerequisite(p)) return true;
  }
  return false;
};

/**
 * Builds a successor lookup for cycle checks from a projection, using a draft list for `fromTicketId`.
 *
 * @param projection - Replayed projection.
 * @param fromTicketId - Ticket being created or updated.
 * @param nextDependsOn - Proposed dependencies for that ticket (normalized).
 */
export const ticketDependsOnSuccessorsForProjection = (
  projection: Projection,
  fromTicketId: string,
  nextDependsOn: readonly string[],
): TicketDependsOnLookup => {
  return (ticketId: string): readonly string[] | undefined => {
    if (ticketId === fromTicketId) {
      return nextDependsOn.length > 0 ? nextDependsOn : undefined;
    }
    const row = projection.tickets.get(ticketId);
    if (!row || row.deleted) return undefined;
    return row.dependsOn;
  };
};

/**
 * Validates a proposed `dependsOn` list before persisting. Returns a human-readable
 * error message, or `undefined` when the list is valid.
 *
 * @param projection - Current replayed state (the new ticket may not exist yet for creates).
 * @param fromTicketId - Ticket id receiving `nextDependsOn` (new id on create).
 * @param nextDependsOn - Normalized prerequisite ids.
 */
export const validateTicketDependsOnForWrite = (params: {
  projection: Projection;
  fromTicketId: string;
  nextDependsOn: readonly string[];
}): string | undefined => {
  const { projection, fromTicketId, nextDependsOn } = params;
  for (const id of nextDependsOn) {
    if (id === fromTicketId) {
      return `Ticket cannot depend on itself (${id})`;
    }
    const row = projection.tickets.get(id);
    if (row === undefined) {
      return `Dependency ticket not found: ${id}`;
    }
    if (row.deleted) {
      return `Dependency ticket deleted: ${id}`;
    }
  }
  const successorsFor = ticketDependsOnSuccessorsForProjection(
    projection,
    fromTicketId,
    nextDependsOn,
  );
  if (
    wouldTicketDependsOnCreateCycle({
      fromTicketId,
      nextDependsOn,
      successorsFor,
    })
  ) {
    return "Ticket dependencies would create a cycle";
  }
  return undefined;
};
