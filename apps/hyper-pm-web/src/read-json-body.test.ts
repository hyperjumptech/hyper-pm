/** @vitest-environment node */
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { readJsonBody } from "./read-json-body";

describe("readJsonBody", () => {
  it("returns null for an empty body", async () => {
    // Setup
    const req = Readable.from([]) as IncomingMessage;

    // Act
    const r = await readJsonBody(req, 1024);

    // Assert
    expect(r).toBeNull();
  });

  it("parses a JSON object", async () => {
    // Setup
    const req = Readable.from([Buffer.from('{"a":1}')]) as IncomingMessage;

    // Act
    const r = await readJsonBody(req, 1024);

    // Assert
    expect(r).toEqual({ a: 1 });
  });

  it("rejects bodies larger than maxBytes", async () => {
    // Setup
    const big = Buffer.alloc(10);
    const req = Readable.from([big, big, big]) as IncomingMessage;

    // Act & Assert
    await expect(readJsonBody(req, 15)).rejects.toThrow(/exceeds/);
  });

  it("rejects invalid JSON", async () => {
    // Setup
    const req = Readable.from([Buffer.from("{")]) as IncomingMessage;

    // Act & Assert
    await expect(readJsonBody(req, 1024)).rejects.toThrow();
  });

  it("uses injectable UTF-8 decoder", async () => {
    // Setup
    const req = Readable.from([Buffer.from([0xff, 0xfe])]) as IncomingMessage;

    // Act
    const r = await readJsonBody(req, 1024, {
      toUtf8: () => '{"x":1}',
    });

    // Assert
    expect(r).toEqual({ x: 1 });
  });
});
