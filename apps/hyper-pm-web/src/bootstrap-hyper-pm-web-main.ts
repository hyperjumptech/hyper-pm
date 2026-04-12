import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@workspace/env";
import { runHyperPmCli } from "@workspace/hyper-pm-cli-runner";
import { createHyperPmWebServer } from "./create-hyper-pm-web-server";
import {
  resolveHyperPmWebRepoRoot,
  resolveHyperPmWebTempDirParent,
} from "./resolve-hyper-pm-web-boot-paths";

const DEFAULT_WEB_PORT = 3847;

/**
 * Boots hyper-pm-web: resolves repo/temp paths, creates the HTTP server, and listens.
 *
 * @param processEnv - Injectable env view (defaults to parsed `@workspace/env`).
 * @param bootDeps - Optional `getCwd` for resolving the default repo root (defaults to `process.cwd`).
 */
export const bootstrapHyperPmWebMain = async (
  processEnv: {
    HYPER_PM_WEB_REPO?: string;
    HYPER_PM_WEB_TEMP_DIR?: string;
    HYPER_PM_WEB_HOST?: string;
    HYPER_PM_WEB_PORT?: number;
    HYPER_PM_WEB_TOKEN?: string;
  } = env,
  bootDeps: { getCwd?: () => string } = {},
): Promise<void> => {
  const getCwd = bootDeps.getCwd ?? (() => process.cwd());
  const repoRoot = resolveHyperPmWebRepoRoot(
    processEnv.HYPER_PM_WEB_REPO,
    getCwd,
  );
  const { tempDirParent, cleanup } = await resolveHyperPmWebTempDirParent(
    processEnv.HYPER_PM_WEB_TEMP_DIR,
  );

  const host = processEnv.HYPER_PM_WEB_HOST?.trim() || "127.0.0.1";
  const rawPort = processEnv.HYPER_PM_WEB_PORT;
  const port =
    rawPort !== undefined && Number.isFinite(rawPort) && rawPort > 0
      ? Math.trunc(rawPort)
      : DEFAULT_WEB_PORT;
  if (port < 1 || port > 65535) {
    console.error(
      "hyper-pm-web: HYPER_PM_WEB_PORT must be between 1 and 65535.",
    );
    process.exit(1);
  }

  const webToken = processEnv.HYPER_PM_WEB_TOKEN?.trim();
  const publicDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
  );

  const server = createHyperPmWebServer({
    repoRoot,
    tempDirParent,
    publicDir,
    webToken: webToken && webToken.length > 0 ? webToken : undefined,
    runHyperPmCliFn: runHyperPmCli,
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      resolve();
    });
    server.on("error", reject);
  });

  const shutdown = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
    if (cleanup !== undefined) {
      await cleanup().catch(() => {});
    }
  };

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      void shutdown()
        .then(() => {
          process.exit(0);
        })
        .catch((err: unknown) => {
          console.error(err);
          process.exit(1);
        });
    });
  }

  console.log(
    `hyper-pm-web listening on http://${host}:${port} (repo=${repoRoot}, temp-dir=${tempDirParent})`,
  );
};
