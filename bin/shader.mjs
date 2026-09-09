#!/usr/bin/env node
import { runShaderCli } from "../dist/build/esm.js";
process.exitCode = await runShaderCli(process.argv.slice(2));
