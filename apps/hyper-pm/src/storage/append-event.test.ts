/** @vitest-environment node */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendEventLine } from "./append-event";

describe("appendEventLine", () => {
  let dir: string;

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes JSONL to a deterministic shard when nextEventId is injected", async () => {
    // Setup
    dir = await mkdtemp(join(tmpdir(), "hyper-pm-append-"));
    const clock = { now: () => new Date("2026-03-15T08:00:00.000Z") };
    const event = {
      schema: 1 as const,
      type: "EpicCreated" as const,
      id: "ep-1",
      ts: "2026-03-15T08:00:00.000Z",
      actor: "test",
      payload: { id: "ep-1", title: "T", body: "", status: "backlog" },
    };

    // Act
    const shardId = "c".repeat(26);
    const rel = await appendEventLine(dir, event, clock, {
      nextEventId: () => shardId,
    });

    // Assert
    expect(rel).toBe(`events/2026/03/part-${shardId}.jsonl`);
    const body = await readFile(join(dir, rel), "utf8");
    expect(body).toBe(`${JSON.stringify(event)}\n`);
  });

  it("strips a trailing slash on dataRoot", async () => {
    // Setup
    const base = await mkdtemp(join(tmpdir(), "hyper-pm-append-slash-"));
    dir = base;
    const clock = { now: () => new Date("2026-02-01T00:00:00.000Z") };
    const event = {
      schema: 1 as const,
      type: "EpicCreated" as const,
      id: "ep-2",
      ts: "2026-02-01T00:00:00.000Z",
      actor: "test",
      payload: { id: "ep-2", title: "T", body: "", status: "backlog" },
    };

    // Act
    const shardId = "d".repeat(26);
    const rel = await appendEventLine(`${base}/`, event, clock, {
      nextEventId: () => shardId,
    });

    // Assert
    const body = await readFile(join(base, rel), "utf8");
    expect(body).toBe(`${JSON.stringify(event)}\n`);
  });
});
