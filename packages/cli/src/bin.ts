#!/usr/bin/env node
import { runCli } from './cli.ts';

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
});
