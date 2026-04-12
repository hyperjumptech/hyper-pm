#!/usr/bin/env node
import { bootstrapHyperPmWebMain } from "./bootstrap-hyper-pm-web-main";

void bootstrapHyperPmWebMain().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
