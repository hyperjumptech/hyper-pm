import type { TicketRecord } from "../storage/projection";
import {
  tryParseTicketPriority,
  tryParseTicketSize,
  type TicketPriority,
  type TicketSize,
} from "./ticket-planning-fields";

/** Optional ticket planning fields stored in the fenced JSON (snake_case keys in JSON). */
export type GithubIssueBodyTicketPlanning = {
  priority?: TicketPriority;
  size?: TicketSize;
  estimate?: number;
  startWorkAt?: string;
  targetFinishAt?: string;
};

const FENCE_JSON_RE = /```json\s*([\s\S]*?)```/i;

/**
 * Parses the first ```json … ``` fence in a GitHub issue body into an object.
 *
 * @param body - Full issue body markdown.
 * @returns Parsed JSON object, or `undefined` when missing or invalid.
 */
export const parseHyperPmFenceObject = (
  body: string,
): Record<string, unknown> | undefined => {
  const fence = body.match(FENCE_JSON_RE);
  if (!fence?.[1]) return undefined;
  try {
    const data: unknown = JSON.parse(fence[1].trim());
    if (typeof data !== "object" || data === null) return undefined;
    return data as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

/**
 * Extracts `hyper_pm_id` from an issue body if the JSON fence is present.
 *
 * @param body - GitHub issue body markdown.
 */
export const parseHyperPmIdFromIssueBody = (
  body: string,
): string | undefined => {
  const meta = parseHyperPmFenceObject(body);
  if (meta === undefined) return undefined;
  const id = meta["hyper_pm_id"];
  return typeof id === "string" ? id : undefined;
};

/**
 * Returns the human description portion of an issue body (text before the first fenced block).
 *
 * @param body - Full GitHub issue body.
 */
export const extractDescriptionBeforeFirstFence = (body: string): string => {
  const fenceIdx = body.indexOf("```");
  if (fenceIdx === -1) {
    return body.trim();
  }
  return body.slice(0, fenceIdx).trim();
};

/**
 * Reads ticket planning fields from fence metadata into a `GithubInboundUpdate`-style payload
 * fragment (camelCase keys: `priority`, `size`, `estimate`, `startWorkAt`, `targetFinishAt`).
 * Only keys **present** on `meta` are included (so absent keys do not clear projection fields).
 *
 * @param meta - Parsed JSON object from the issue fence.
 */
export const inboundTicketPlanningPayloadFromFenceMeta = (
  meta: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(meta, "priority")) {
    const v = meta["priority"];
    if (v === null) {
      out["priority"] = null;
    } else if (typeof v === "string") {
      const p = tryParseTicketPriority(v);
      if (p !== undefined) {
        out["priority"] = p;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(meta, "size")) {
    const v = meta["size"];
    if (v === null) {
      out["size"] = null;
    } else if (typeof v === "string") {
      const s = tryParseTicketSize(v);
      if (s !== undefined) {
        out["size"] = s;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(meta, "estimate")) {
    const v = meta["estimate"];
    if (v === null) {
      out["estimate"] = null;
    } else if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out["estimate"] = v;
    }
  }

  if (Object.prototype.hasOwnProperty.call(meta, "start_work_at")) {
    const v = meta["start_work_at"];
    if (v === null) {
      out["startWorkAt"] = null;
    } else if (typeof v === "string") {
      const t = v.trim();
      if (t !== "" && Number.isFinite(Date.parse(t))) {
        out["startWorkAt"] = t;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(meta, "target_finish_at")) {
    const v = meta["target_finish_at"];
    if (v === null) {
      out["targetFinishAt"] = null;
    } else if (typeof v === "string") {
      const t = v.trim();
      if (t !== "" && Number.isFinite(Date.parse(t))) {
        out["targetFinishAt"] = t;
      }
    }
  }

  return out;
};

/**
 * Builds GitHub Issue body with a fenced JSON block carrying `hyper_pm_id` and optional ticket planning.
 *
 * @param params - Stable ids, free-form description, and optional ticket planning for `type: "ticket"`.
 */
export const buildGithubIssueBody = (params: {
  hyperPmId: string;
  type: "epic" | "story" | "ticket";
  parentIds: Record<string, string | undefined>;
  description: string;
  /** When `type` is `ticket`, embedded in the JSON fence (snake_case keys in JSON). */
  ticketPlanning?: GithubIssueBodyTicketPlanning;
}): string => {
  const meta: Record<string, unknown> = {
    hyper_pm_id: params.hyperPmId,
    type: params.type,
    parent_ids: params.parentIds,
  };
  if (params.type === "ticket" && params.ticketPlanning !== undefined) {
    const p = params.ticketPlanning;
    if (p.priority !== undefined) {
      meta.priority = p.priority;
    }
    if (p.size !== undefined) {
      meta.size = p.size;
    }
    if (p.estimate !== undefined) {
      meta.estimate = p.estimate;
    }
    if (p.startWorkAt !== undefined) {
      meta.start_work_at = p.startWorkAt;
    }
    if (p.targetFinishAt !== undefined) {
      meta.target_finish_at = p.targetFinishAt;
    }
  }
  return `${params.description.trim()}\n\n\`\`\`json\n${JSON.stringify(meta, null, 2)}\n\`\`\`\n`;
};

/**
 * Builds optional ticket planning for the GitHub issue fence from a projection ticket row.
 *
 * @param ticket - Ticket read model (non-deleted).
 */
export const ticketPlanningForGithubIssueBody = (
  ticket: TicketRecord,
): GithubIssueBodyTicketPlanning | undefined => {
  const out: GithubIssueBodyTicketPlanning = {};
  if (ticket.priority !== undefined) {
    out.priority = ticket.priority;
  }
  if (ticket.size !== undefined) {
    out.size = ticket.size;
  }
  if (ticket.estimate !== undefined) {
    out.estimate = ticket.estimate;
  }
  if (ticket.startWorkAt !== undefined) {
    out.startWorkAt = ticket.startWorkAt;
  }
  if (ticket.targetFinishAt !== undefined) {
    out.targetFinishAt = ticket.targetFinishAt;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};
