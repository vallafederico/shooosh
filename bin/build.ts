import type { BuildConfig } from "bun"
import { build } from "bun"
import dts from "bun-plugin-dts"
import { spawn } from "bun"

const option: BuildConfig = {
  entrypoints: ["./package/index.ts"],
  outdir: "./dist",
  minify: true,
  sourcemap: "external",
  plugins: [dts()],
}

async function run() {
  try {
    await Promise.all([
      build({
        ...option,
        format: "esm",
        naming: "[dir]/esm.js",
      }),
      build({
        ...option,
        format: "cjs",
        naming: "[dir]/cjs.js",
      }),
      build({
        entrypoints: ["./package/global.ts"],
        outdir: "./dist",
        format: "iife",
        naming: "shooosh.min.js",
        target: "browser",
        minify: true,
        sourcemap: "none",
      }),
      build({
        entrypoints: ["./package/msdf/index.ts"],
        outdir: "./dist/msdf",
        format: "esm",
        target: "node",
        naming: "index.js",
        minify: false,
        sourcemap: "external",
        external: ["sharp", "msdf-bmfont-xml"],
      }),
    ])

    const testProcess = spawn({
      cmd: ["bun", "run", "bin/test-build.ts"],
      stdout: "inherit",
      stderr: "inherit",
    })

    const exitCode = await testProcess.exited
    if (exitCode !== 0) {
      console.error("\nBuild verification tests failed!")
      process.exit(1)
    }
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

run()
