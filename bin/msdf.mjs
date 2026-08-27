#!/usr/bin/env node
import { runMsdfCli } from "../dist/msdf/index.js";

const code = await runMsdfCli(process.argv.slice(2));
process.exit(code);
