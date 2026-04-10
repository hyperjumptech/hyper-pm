# hyper-pm

Git-native PM CLI: orphan data branch, disposable temp worktrees, append-only JSONL, optional GitHub Issues sync.

## Quickstart

```bash
pnpm build --filter=hyper-pm
node apps/hyper-pm/dist/main.cjs init
node apps/hyper-pm/dist/main.cjs epic create --title "My epic"
```

Use `hyper-pm` on your PATH after linking or via `pnpm exec hyper-pm` from a package that depends on this workspace package.
