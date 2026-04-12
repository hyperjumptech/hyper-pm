# hyper-pm

Git-native project management CLI: an orphan data branch, disposable temp worktrees, append-only JSONL event log, and optional GitHub Issues sync.

## Requirements

- Node.js 20+
- Git repository with `hyper-pm` initialized (`init`)
- Optional: GitHub auth for sync (`GITHUB_TOKEN` or authenticated [GitHub CLI](https://cli.github.com/) via `gh auth login`) and repo slug; `HYPER_PM_AI_API_KEY` for AI ticket helpers

## Install and run

From the monorepo root:

```bash
pnpm build --filter=hyper-pm
```

Then either:

- **Direct:** `node apps/hyper-pm/dist/main.cjs <command> [options]`
- **On PATH:** link the package or use `pnpm exec hyper-pm` from a workspace that depends on `hyper-pm`
- **Discover flags:** `hyper-pm --help`, `hyper-pm epic --help`, `hyper-pm epic create --help`, etc.

## Global options

These apply before any subcommand (for example `hyper-pm --format text epic read`).

| Option                       | Description                                                  | Default                           |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------- |
| `--format <fmt>`             | Output format: `json` or `text`                              | `json`                            |
| `--temp-dir <dir>`           | Parent directory for disposable git worktrees                | `TMPDIR` / system temp            |
| `--keep-worktree`            | Do not remove the temp worktree after the command            | off                               |
| `--repo <path>`              | Git repository root (defaults to current working directory)  | `cwd`                             |
| `--data-branch <name>`       | Data branch name (overrides config / `init`)                 | from config, else `hyper-pm-data` |
| `--remote <name>`            | Remote name (`init` / config)                                | `origin`                          |
| `--sync <mode>`              | Persisted sync mode: `off`, `outbound`, or `full`            | (see `init` / config)             |
| `--github-repo <owner/repo>` | GitHub repository slug                                       | env / config                      |
| `--actor <label>`            | JSONL `actor` for CLI mutations (overrides `HYPER_PM_ACTOR`) | resolved from git user / env      |

## Commands

### `init`

Create or adopt the orphan data branch and write `.hyper-pm/config.json`.

Uses global options only (no subcommand-specific flags).

### `epic`

| Subcommand | Description                                   | Options                                                                                                                                                                      |
| ---------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`   | Create an epic                                | **Required:** `--title <t>`. **Optional:** `--body <b>` (default `""`), `--id <id>`, `--status <s>` (`backlog`, `todo`, `in_progress`, `done`, `cancelled`; default backlog) |
| `read`     | One epic by id, or list all if `--id` omitted | `--id <id>`                                                                                                                                                                  |
| `update`   | Patch an epic                                 | **Required:** `--id <id>`. **Optional:** `--title <t>`, `--body <b>`, `--status <s>` (same values as `create`)                                                               |
| `delete`   | Soft-delete an epic                           | **Required:** `--id <id>`                                                                                                                                                    |

### `story`

| Subcommand | Description                  | Options                                                                                                                              |
| ---------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `create`   | Create a story under an epic | **Required:** `--title <t>`, `--epic <id>`. **Optional:** `--body <b>` (default `""`), `--id <id>`, `--status <s>` (default backlog) |
| `read`     | One story or list all        | `--id <id>`. **Optional when listing:** `--epic <id>` (only stories under that epic)                                                 |
| `update`   | Patch a story                | **Required:** `--id <id>`. **Optional:** `--title <t>`, `--body <b>`, `--status <s>` (same status values as epic)                    |
| `delete`   | Soft-delete a story          | **Required:** `--id <id>`                                                                                                            |

### `ticket`

| Subcommand | Description                               | Options                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`   | Create a ticket                           | **Required:** `--title <t>`. **Optional:** `--story <id>` (omit to create an unlinked ticket; story must exist), `--body <b>` (default `""`), `--id <id>`, `--status <s>` (default `todo`), `--assignee <login>` (GitHub login, normalized), `--branch <name>` (repeatable; link git branches), `--ai-draft` (draft body via AI; needs `HYPER_PM_AI_API_KEY`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `read`     | One ticket or list all                    | `--id <id>` (JSON includes `storyId` — `null` when unlinked — plus `assignee`, `linkedBranches`, `comments` (from `ticket comment`), `prActivityRecent` / list rows include `assignee`, `linkedBranches` when non-empty, `lastPrActivity` when replayed). **When listing (omit `--id`):** `--story <id>` _or_ `--epic <id>` _or_ `--without-story` (each mutually exclusive); `--status <s>` repeatable (OR of `backlog`, `todo`, `in_progress`, `done`, `cancelled`); date bounds `--created-after` / `--created-before`, `--updated-after` / `--updated-before`, `--status-changed-after` / `--status-changed-before` (ISO-8601, inclusive); `--created-by` / `--updated-by` / `--status-changed-by` (substring, case-sensitive); `--title-contains` (case-insensitive); `--github-linked` (only tickets with `githubIssueNumber`); `--branch <name>` (normalized exact match on a linked branch); **`--sort-by`** (`id`, `title`, `status`, `storyId`, `createdAt`, `updatedAt`, `statusChangedAt`, `assignee`, `githubIssueNumber`, `lastPrActivityAt`; default `id`); **`--sort-dir`** `asc`\|`desc` (default `asc`; ties break on `id` ascending) |
| `update`   | Patch a ticket                            | **Required:** `--id <id>`. **Optional:** `--title <t>`, `--body <b>`, `--status <s>` (same status values), `--story <id>` (attach to story; mutually exclusive with `--unlink-story`), `--unlink-story` (clear story), `--assignee <login>`, `--unassign` (mutually exclusive with `--assignee`), `--add-branch <name>` / `--remove-branch <name>` (repeatable; mutually exclusive with `--clear-branches`), `--clear-branches` (clear all linked branches), `--ai-improve` (rewrite `--body` with AI; **requires** `--body` and `HYPER_PM_AI_API_KEY`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `comment`  | Append a ticket comment (local event log) | **Required:** `--id <id>`, `--body <text>` (non-empty after trim). Appends `TicketCommentAdded`; `ticket read --id` includes a `comments` array.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `delete`   | Soft-delete a ticket                      | **Required:** `--id <id>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Tickets store at most one assignee (GitHub login). With GitHub sync, outbound updates set that user as the issue’s only assignee (extra assignees on the issue may be removed), and inbound reads the first assignee from the API when the issue has several. Outbound **creates** GitHub issues only for tickets that have a valid epic+story chain; unlinked tickets are skipped until you set `--story`. Tickets that **already** have a linked GitHub issue are still **updated** when unlinked (issue body drops parent ids until you link again).

### `sync`

GitHub Issues sync (outbound + inbound). With `sync: full` in config, after inbound it also loads linked PR timelines for tickets in **`in_progress`** that have `Refs` / `Closes` / `Fixes #<n>` in the body, appending durable `GithubPrActivity` events (opened seed via `pulls.get`, plus timeline rows such as comments, reviews, pushes, merge/close). That issues extra GitHub API calls per linked PR.

Skips network work if `sync` is `off` in config, or if you pass `--no-github`.

| Option        | Description          | Default                          |
| ------------- | -------------------- | -------------------------------- |
| `--no-github` | Skip GitHub API sync | sync runs when enabled in config |

When sync is not skipped, requires `GITHUB_TOKEN` **or** a local `gh` session (`gh auth token` must succeed).

### `audit`

List durable events (who / what / when) with optional filters.

| Option             | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `--limit <n>`      | Keep only the **most recent** _n_ matching events                     |
| `--type <t>`       | Filter by event type (must be one of the values below)                |
| `--entity-id <id>` | Filter rows whose payload `id`, `entityId`, or `ticketId` matches     |
| `--text-style <s>` | When `--format text` only: `tsv` (default), `plain`, or `plain-links` |

Valid `--type` values: `EpicCreated`, `EpicUpdated`, `EpicDeleted`, `StoryCreated`, `StoryUpdated`, `StoryDeleted`, `TicketCreated`, `TicketUpdated`, `TicketDeleted`, `TicketCommentAdded`, `SyncCursor`, `GithubInboundUpdate`, `GithubIssueLinked`, `GithubPrActivity`.

`GithubPrActivity` payloads include `ticketId`, `prNumber`, `kind` (`opened` | `updated` | `commented` | `reviewed` | `merged` | `closed` | `ready_for_review`), `sourceId`, `occurredAt`, and optionally `reviewState` / `url`.

With `--format text`, `--text-style` selects output: **`tsv`** — tab-separated `ts`, `type`, `actor`, `id` (extra columns for `GithubPrActivity`); **`plain`** — one English sentence per event (`timestamp: actor …`); **`plain-links`** — same sentence plus a tab and compact JSON (ids and URLs; no ticket body/title text). For `plain-links`, if `githubRepo` resolves from config or `GITHUB_REPO`, derived `issueHtmlUrl` / `pullHtmlUrl` fields are included when applicable.

With `--format json`, the result includes `events` and any `invalidLines` skipped during parse; `--text-style` is ignored.

### `doctor`

Validate that the event log on the data branch can be read and replayed. Exits non-zero if issues are found.

No subcommand-specific options.

## Environment variables

See `apps/hyper-pm/env.example`. Commonly:

| Variable              | Used for                                                                      |
| --------------------- | ----------------------------------------------------------------------------- |
| `GITHUB_REPO`         | Default repo slug (`owner/repo`)                                              |
| `GITHUB_TOKEN`        | `sync` and GitHub identity for outbound actor (optional if `gh` is logged in) |
| `HYPER_PM_AI_API_KEY` | `ticket create --ai-draft`, `ticket update --ai-improve`                      |
| `HYPER_PM_ACTOR`      | Default audit label for mutations (override with `--actor`)                   |
| `TMPDIR`              | Default parent for disposable worktrees (override with `--temp-dir`)          |

## Publishing to npm

The package is configured for the public registry (`private` unset, `files` whitelist, bundled CLI). Prefer **`pnpm publish`** from this app (or `--filter hyper-pm`) so workspace devDependencies stay correct. Run `pnpm run build` first so `dist/main.cjs` and `dist/index.cjs` exist.

## Quickstart

```bash
pnpm build --filter=hyper-pm
node apps/hyper-pm/dist/main.cjs init
node apps/hyper-pm/dist/main.cjs epic create --title "My epic"
node apps/hyper-pm/dist/main.cjs --format text epic read
```
