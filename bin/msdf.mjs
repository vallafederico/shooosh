#!/usr/bin/env node
/**
 * Published CLI (`npx shooosh-msdf`). Needs a prior `pnpm build:package`.
 * In this repo use `pnpm msdf` / `bun run bin/msdf.ts` against source.
 *
 * Docs: docs/msdf.md
 */
import { runMsdfCli } from "../dist/msdf/index.js";

const code = await runMsdfCli(process.argv.slice(2));
process.exit(code);
