# hyper-pm

Git-native PM CLI: orphan data branch, disposable temp worktrees, append-only JSONL, optional GitHub Issues sync.

## Quickstart

```bash
pnpm build --filter=hyper-pm
node packages/hyper-pm/dist/main.js init
node packages/hyper-pm/dist/main.js epic create --title "My epic"
```

Use `hyper-pm` on your PATH after linking or via `pnpm exec hyper-pm` from a package that depends on this workspace package.

## Docs

- Environment keys live in `@workspace/env` (`GITHUB_TOKEN`, `GITHUB_REPO`, `HYPER_PM_AI_API_KEY`, `TMPDIR`). See `env.example` in this package for CLI-specific hints.
- Tickets: `HYPER-PM-GIT-*` under `~/.cursor/plans/tickets/`.
