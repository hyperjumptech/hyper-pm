import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { join } from "node:path";
import {
  hyperPmRunInputSchema,
  runHyperPmCli,
  tryParseStdoutJson,
  type RunHyperPmCliResult,
} from "@workspace/hyper-pm-cli-runner";
import { assertArgvNoForcedCliFlags } from "./assert-argv-no-forced-cli-flags";
import { readJsonBody } from "./read-json-body";

const postRunBodySchema = hyperPmRunInputSchema.omit({
  repo: true,
  tempDir: true,
});

const MAX_JSON_BODY_BYTES = 512 * 1024;

export type HyperPmWebServerConfig = {
  /** Absolute git repository root (injected as `--repo`). */
  repoRoot: string;
  /** Parent directory for disposable worktrees (injected as `--temp-dir`). */
  tempDirParent: string;
  /** Directory containing `index.html`, `app.js`, and `audit-event-summary.js`. */
  publicDir: string;
  /** When set, POST /api/run requires matching `Authorization: Bearer`. */
  webToken?: string;
  /** Injected CLI runner (defaults to real `runHyperPmCli`). */
  runHyperPmCliFn: typeof runHyperPmCli;
  /** File reader for static assets (defaults to `readFile`). */
  readFileFn?: typeof readFile;
  /** Constant-time compare (defaults to `crypto.timingSafeEqual`). */
  timingSafeEqualFn?: typeof timingSafeEqual;
};

/**
 * Writes JSON to an HTTP response and ends the stream.
 *
 * @param res - Server response.
 * @param status - HTTP status code.
 * @param body - Serializable JSON body.
 */
const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

/**
 * Validates `Authorization: Bearer` when a server token is configured.
 *
 * @param req - Incoming HTTP request.
 * @param token - Expected bearer secret (non-empty).
 * @param timingSafeEqualFn - Constant-time buffer compare.
 * @returns Whether the request is authorized.
 */
const bearerAuthorized = (
  req: IncomingMessage,
  token: string,
  timingSafeEqualFn: typeof timingSafeEqual,
): boolean => {
  const h = req.headers.authorization;
  if (h === undefined || !h.startsWith("Bearer ")) {
    return false;
  }
  const got = h.slice("Bearer ".length);
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqualFn(a, b);
};

/**
 * Creates the hyper-pm-web HTTP server (static UI + `/api/run` that spawns the CLI).
 *
 * @param config - Repo/temp paths, static root, optional auth, and injectable runner.
 * @returns Node `http.Server` instance (not yet listening).
 */
export const createHyperPmWebServer = (
  config: HyperPmWebServerConfig,
): Server => {
  const run = config.runHyperPmCliFn;
  const readFn = config.readFileFn ?? readFile;
  const safeEq = config.timingSafeEqualFn ?? timingSafeEqual;

  return createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const path = url.pathname;

        if (req.method === "GET" && path === "/api/health") {
          sendJson(res, 200, {
            ok: true,
            repoPath: config.repoRoot,
            tempDirParent: config.tempDirParent,
          });
          return;
        }

        if (req.method === "POST" && path === "/api/run") {
          if (
            config.webToken !== undefined &&
            config.webToken.length > 0 &&
            !bearerAuthorized(req, config.webToken, safeEq)
          ) {
            sendJson(res, 401, { ok: false, error: "unauthorized" });
            return;
          }

          let raw: unknown;
          try {
            raw = await readJsonBody(req, MAX_JSON_BODY_BYTES);
          } catch (e) {
            sendJson(res, 400, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
            return;
          }
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            sendJson(res, 400, {
              ok: false,
              error: "expected JSON object body",
            });
            return;
          }

          const parsed = postRunBodySchema.safeParse(raw);
          if (!parsed.success) {
            sendJson(res, 400, {
              ok: false,
              error: "invalid body",
              details: parsed.error.flatten(),
            });
            return;
          }

          try {
            assertArgvNoForcedCliFlags(parsed.data.argv);
          } catch (e) {
            sendJson(res, 400, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
            return;
          }

          const input = {
            ...parsed.data,
            repo: config.repoRoot,
            tempDir: config.tempDirParent,
          };

          let result: RunHyperPmCliResult;
          try {
            result = await run(input);
          } catch (e) {
            sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
            return;
          }

          sendJson(res, 200, {
            ok: true,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            signal: result.signal,
            json: tryParseStdoutJson(result.stdout),
          });
          return;
        }

        if (req.method === "GET" && (path === "/" || path === "/index.html")) {
          const html = await readFn(
            join(config.publicDir, "index.html"),
            "utf8",
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }

        if (req.method === "GET" && path === "/app.js") {
          const js = await readFn(join(config.publicDir, "app.js"), "utf8");
          res.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
          });
          res.end(js);
          return;
        }

        if (req.method === "GET" && path === "/audit-event-summary.js") {
          const js = await readFn(
            join(config.publicDir, "audit-event-summary.js"),
            "utf8",
          );
          res.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
          });
          res.end(js);
          return;
        }

        sendJson(res, 404, { ok: false, error: "not found" });
      } catch (e) {
        sendJson(res, 500, {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  });
};
