#!/usr/bin/env node
import { bootstrapHyperPmMcpMain } from "./bootstrap-hyper-pm-mcp-main";

void bootstrapHyperPmMcpMain().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
