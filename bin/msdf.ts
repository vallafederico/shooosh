#!/usr/bin/env bun
import { runMsdfCli } from "../package/msdf/cli";

const code = await runMsdfCli(process.argv.slice(2));
process.exit(code);
