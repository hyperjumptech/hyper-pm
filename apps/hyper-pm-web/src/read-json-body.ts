import type { IncomingMessage } from "node:http";

/**
 * Reads and parses a JSON object from an HTTP request body (size-capped).
 *
 * @param req - Incoming message with a readable body.
 * @param maxBytes - Maximum body size to accept.
 * @param deps - Injectable `String` constructor for tests.
 * @returns Parsed object when body is non-empty JSON object or array; `null` when body is empty.
 * @throws Error when body exceeds `maxBytes` or is invalid JSON / wrong JSON top-level type.
 */
export const readJsonBody = async (
  req: IncomingMessage,
  maxBytes: number,
  deps: { toUtf8: (buf: Buffer) => string } = {
    toUtf8: (buf) => buf.toString("utf8"),
  },
): Promise<unknown | null> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += b.length;
    if (total > maxBytes) {
      throw new Error(`request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(b);
  }
  const raw = deps.toUtf8(Buffer.concat(chunks)).trim();
  if (raw.length === 0) {
    return null;
  }
  return JSON.parse(raw) as unknown;
};
