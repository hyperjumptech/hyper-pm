/**
 * Bundler entry for the published CommonJS API (`dist/index.cjs`).
 * Kept separate from `index.ts` so esbuild emits reachable top-level `var` bindings
 * for a small `module.exports` footer in the package build script.
 */
export { ExitCode, openDataBranchWorktree, runCli, runGit } from "./index";
