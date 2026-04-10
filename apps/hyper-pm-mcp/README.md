# hyper-pm-mcp

stdio [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [`hyper-pm`](../hyper-pm) CLI to MCP hosts (for example Cursor or Claude Desktop).

## Security

The `hyper_pm_run` tool runs **the same hyper-pm process** you would run locally with the given arguments. Only enable this server in MCP configurations you trust.

## Build order

From the monorepo root:

1. Build the CLI bundle: `pnpm --filter hyper-pm build`
2. Build this server: `pnpm --filter hyper-pm-mcp build`

The server resolves the CLI at `hyper-pm/dist/main.cjs` via the `hyper-pm` package entry (see `resolve-hyper-pm-main-path.ts`). Ensure `dist/main.cjs` exists before starting the MCP server.

## Environment

Optional variables are documented in [env.example](./env.example) and parsed through `@workspace/env`. Notable:

- **`HYPER_PM_CLI_PATH`**: absolute path to `main.cjs` when resolution from the workspace package is not sufficient.

## Cursor MCP example

After building, point the host at the bundled ESM entry:

```json
{
  "mcpServers": {
    "hyper-pm": {
      "command": "node",
      "args": ["/absolute/path/to/hyper-pm/apps/hyper-pm-mcp/dist/main.mjs"],
      "env": {}
    }
  }
}
```

Use the real absolute path to `dist/main.mjs` on your machine (or a `pnpm exec` / wrapper script that runs it).

## Tool: `hyper_pm_run`

- **`argv`** (required): CLI tokens after global options, e.g. `["epic", "read"]` or `["doctor"]`.
- Optional fields mirror hyper-pm globals: `cwd`, `repo`, `tempDir`, `actor`, `githubRepo`, `dataBranch`, `remote`, `sync`, `keepWorktree`.

`--format json` is always injected. The tool response is JSON text with `exitCode`, `stdout`, `stderr`, `signal`, and `parsedStdout` (when stdout is valid JSON).

## Scripts

- `pnpm build` — bundle to `dist/main.mjs`
- `pnpm test` / `pnpm test:coverage`
- `pnpm check-types` / `pnpm lint`
