import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "@workspace/env";
import { runHyperPmCli } from "@workspace/hyper-pm-cli-runner";
import { createHyperPmWebServer } from "./create-hyper-pm-web-server";

const DEFAULT_WEB_PORT = 3847;

/**
 * Boots hyper-pm-web: validates env, creates the HTTP server, and listens.
 *
 * @param processEnv - Injectable env view (defaults to parsed `@workspace/env`).
 */
export const bootstrapHyperPmWebMain = async (
  processEnv: {
    HYPER_PM_WEB_REPO?: string;
    HYPER_PM_WEB_TEMP_DIR?: string;
    HYPER_PM_WEB_HOST?: string;
    HYPER_PM_WEB_PORT?: number;
    HYPER_PM_WEB_TOKEN?: string;
  } = env,
): Promise<void> => {
  const repoRoot = processEnv.HYPER_PM_WEB_REPO?.trim();
  const tempParent = processEnv.HYPER_PM_WEB_TEMP_DIR?.trim();
  if (!repoRoot || !tempParent) {
    console.error(
      "hyper-pm-web: set HYPER_PM_WEB_REPO and HYPER_PM_WEB_TEMP_DIR (absolute paths).",
    );
    process.exit(1);
  }

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
    tempDirParent: tempParent,
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

  console.log(`hyper-pm-web listening on http://${host}:${port}`);
};
