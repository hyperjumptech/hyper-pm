# hyper-pm monorepo

Git-native project management: **`hyper-pm`** CLI, optional **`hyper-pm-web`** UI, and **`hyper-pm-mcp`** for editors. Product documentation lives in **`docs/`** (Speed Docs / MDX).

## Usage

```bash
pnpm install
```

## Documentation site

Preview locally:

```bash
pnpm docs:dev
```

Static build (output directory follows your installed **speed-docs** version, often **`docs-output/`** at the repo root):

```bash
pnpm docs:build
```

## Packages

| Area                | Path                                           |
| ------------------- | ---------------------------------------------- |
| CLI                 | `apps/hyper-pm`                                |
| Web UI              | `apps/hyper-pm-web`                            |
| MCP server          | `apps/hyper-pm-mcp`                            |
| Shared env / runner | `packages/env`, `packages/hyper-pm-cli-runner` |

See each app’s **`README.md`** for commands and environment variables.

## Code quality

From the repo root:

```bash
pnpm code-quality
```
