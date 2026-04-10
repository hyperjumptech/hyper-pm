# hyper-pm

Git-native PM CLI: orphan data branch, disposable temp worktrees, append-only JSONL, optional GitHub Issues sync.

## Quickstart

```bash
pnpm build --filter=hyper-pm
node apps/hyper-pm/dist/main.cjs init
node apps/hyper-pm/dist/main.cjs epic create --title "My epic"
```

Use `hyper-pm` on your PATH after linking or via `pnpm exec hyper-pm` from a package that depends on this workspace package.

## Workflow status

Epics, stories, and tickets share a `status` value: `backlog`, `todo`, `in_progress`, `done`, `cancelled`.

- **Defaults:** `epic create` / `story create` default to `backlog` when `--status` is omitted; `ticket create` defaults to `todo`.
- **CLI:** pass `--status <value>` on create/update. `ticket update` no longer accepts `--state` (legacy JSONL may still carry `state` on tickets for replay).
- **Reads:** each row includes `status`, `statusChangedAt`, and `statusChangedBy` for the **last time `status` changed**. `updatedAt` / `updatedBy` still reflect **any** field change (title, body, link, delete, etc.). For a full history of transitions, use `hyper-pm audit`.

### GitHub Issues (tickets)

Outbound and inbound sync map workflow status to GitHub issue **open/closed**: `done` and `cancelled` → closed; `backlog`, `todo`, and `in_progress` → open. Inbound full sync preserves non-terminal statuses when an issue stays open (for example `in_progress` is not reset on every poll). Reopening a closed issue on GitHub moves `done` / `cancelled` to `todo`.

## Audit trail

Every durable change is an append-only JSONL event with `ts` (when), `type` + `payload` (what), and `actor` (who).

- **Local mutations:** `actor` defaults to `git config user.name` / `user.email` at the repo (`cli:…`), then falls back to `local:<os-user>`. Override with `HYPER_PM_ACTOR` or global `--actor <label>`.
- **GitHub outbound sync** (`GithubIssueLinked`, `SyncCursor`): `github:<login>` when the token can read the authenticated user; otherwise `github-sync`.
- **GitHub inbound** (`GithubInboundUpdate`): `github:<issue.user.login>` when present. That login is the **issue author**, not necessarily whoever last edited the issue on GitHub.

Inspect the log:

```bash
hyper-pm audit
hyper-pm audit --type TicketUpdated --entity-id <ticketUlid> --limit 20
hyper-pm audit --format json
```

Data-branch git commits also append a shortened `actor` to the subject (e.g. `hyper-pm: mutation (cli:…)`).

## Docs

- Environment keys live in `@workspace/env` (`GITHUB_TOKEN`, `GITHUB_REPO`, `HYPER_PM_AI_API_KEY`, `HYPER_PM_ACTOR`, `TMPDIR`). See `env.example` in this package for CLI-specific hints.
- Tickets: `HYPER-PM-GIT-*` under `~/.cursor/plans/tickets/`.
