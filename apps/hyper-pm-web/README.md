# hyper-pm-web

Small **local** web UI around the `hyper-pm` CLI.

## Publishing to npm

Publish **`hyper-pm` first**, then this package. Prefer **`pnpm publish`** from this app directory (or `pnpm publish --filter hyper-pm-web`) so pnpm rewrites the `workspace:^` range on `hyper-pm` to a concrete semver in the published manifest. Plain `npm publish` can leave `workspace:` specifiers intact and produce an uninstallable tarball. The server spawns the same bundled CLI as the terminal (`hyper-pm/dist/main.cjs`), so behavior matches the CLI. The browser UI uses a **sidebar** (Overview, Epics, Stories, Tickets, Tools) to list work items, open them for edit, create new ones, delete, and **comment on tickets**; **Advanced CLI** still accepts raw argv.

## Security

- Defaults to **127.0.0.1** (see `HYPER_PM_WEB_HOST`). Do not expose this service to untrusted networks without a proper reverse proxy and auth story.
- **`--repo`**, **`--temp-dir`**, and **`--format`** are always chosen by the server; the browser cannot override them via `argv`.
- Optional **`HYPER_PM_WEB_TOKEN`**: when set, `POST /api/run` requires `Authorization: Bearer <token>`.

## Setup

1. Build the CLI package so `dist/main.cjs` exists:

   ```bash
   pnpm --filter hyper-pm build
   ```

2. Optional environment variables (see root `packages/env/env.example`):
   - **`HYPER_PM_WEB_REPO`** — git repository root for `--repo`. If unset, defaults to **the current working directory** (`process.cwd()`), resolved to an absolute path.
   - **`HYPER_PM_WEB_TEMP_DIR`** — parent directory for disposable git worktrees. If unset, the server **creates** a unique directory under the OS temp directory (same family as `os.tmpdir()`) and **deletes it** when the process receives `SIGINT` or `SIGTERM`.
   - Optional: `HYPER_PM_WEB_HOST`, `HYPER_PM_WEB_PORT`, `HYPER_PM_WEB_TOKEN`

3. Run the web server from the repo you want to manage (so the default `--repo` is correct), or set `HYPER_PM_WEB_REPO`:

   ```bash
   cd /path/to/your/git/repo
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
