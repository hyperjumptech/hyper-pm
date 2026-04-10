import { z } from "zod";

/** Supported durable event types stored as JSONL lines. */
export const eventTypeSchema = z.enum([
  "EpicCreated",
  "EpicUpdated",
  "EpicDeleted",
  "StoryCreated",
  "StoryUpdated",
  "StoryDeleted",
  "TicketCreated",
  "TicketUpdated",
  "TicketDeleted",
  "SyncCursor",
  "GithubInboundUpdate",
  "GithubIssueLinked",
  "GithubPrActivity",
]);

export const eventLineSchema = z.object({
  schema: z.literal(1),
  type: eventTypeSchema,
  id: z.string().min(1),
  ts: z.string().min(1),
  actor: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

export type EventLine = z.infer<typeof eventLineSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
