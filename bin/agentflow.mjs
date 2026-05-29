#!/usr/bin/env node
import { run } from '../src/cli.mjs';

run(process.argv.slice(2)).catch((err) => {
  console.error(`\nagentflow: ${err.message}`);
  if (process.env.AGENTFLOW_DEBUG) console.error(err.stack);
  process.exit(1);
});
