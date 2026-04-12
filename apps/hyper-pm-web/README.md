# hyper-pm-web

Small **local** web UI around the `hyper-pm` CLI. The server spawns the same bundled CLI as the terminal (`hyper-pm/dist/main.cjs`), so behavior matches the CLI.

## Security

- Defaults to **127.0.0.1** (see `HYPER_PM_WEB_HOST`). Do not expose this service to untrusted networks without a proper reverse proxy and auth story.
- **`HYPER_PM_WEB_REPO`** and **`HYPER_PM_WEB_TEMP_DIR`** are always injected by the server; the browser cannot override `--repo`, `--temp-dir`, or `--format`.
- Optional **`HYPER_PM_WEB_TOKEN`**: when set, `POST /api/run` requires `Authorization: Bearer <token>`.

## Setup

1. Build the CLI package so `dist/main.cjs` exists:

   ```bash
   pnpm --filter hyper-pm build
   ```

2. Set environment variables (see root `packages/env/env.example`):
   - `HYPER_PM_WEB_REPO` — absolute path to the git repository
   - `HYPER_PM_WEB_TEMP_DIR` — parent directory for disposable git worktrees
   - Optional: `HYPER_PM_WEB_HOST`, `HYPER_PM_WEB_PORT`, `HYPER_PM_WEB_TOKEN`

3. Run the web server:

   ```bash
   pnpm --filter hyper-pm-web dev
   ```

   Or production-style:

   ```bash
   pnpm --filter hyper-pm-web build
   pnpm --filter hyper-pm-web start
   ```

Open the printed URL (default `http://127.0.0.1:3847`).

## API

- `GET /api/health` — `{ ok, repoPath, tempDirParent }`
- `POST /api/run` — JSON body: same shape as `@workspace/hyper-pm-cli-runner` input **except** `repo` and `tempDir` are ignored/forbidden in `argv`; server merges configured paths.

GitHub sync and other CLI features use the same env vars as the CLI (`GITHUB_TOKEN`, `GITHUB_REPO`, etc.).
