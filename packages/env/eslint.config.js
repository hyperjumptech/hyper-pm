import { config as baseConfig } from "@workspace/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    rules: {
      // This package defines the canonical env object; parsing `process.env` is expected here.
      "strict-env/no-process-env": "off",
    },
  },
];
