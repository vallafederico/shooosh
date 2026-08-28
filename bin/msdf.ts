#!/usr/bin/env bun
/**
 * Dev CLI for shooosh/msdf. After publish, `npx shooosh-msdf` uses bin/msdf.mjs.
 *
 * How to use:
 *   bun run bin/msdf.ts fonts/Inter.ttf icons/ --out public/msdf
 *   pnpm msdf -- --help
 *
 * Docs: docs/msdf.md
 */
import { runMsdfCli } from "../package/msdf/cli";

const code = await runMsdfCli(process.argv.slice(2));
process.exit(code);
