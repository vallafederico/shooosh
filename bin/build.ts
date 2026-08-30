/**
 * Package build — ESM / CJS / IIFE + Node `shooosh/msdf`.
 *
 * How to use: `bun run bin/build.ts` or `pnpm build:package`.
 * Browser entries: package/index.ts, package/global.ts.
 * Node entry: package/msdf/index.ts (external: sharp, msdf-bmfont-xml).
 * Do not bundle msdf into the IIFE / site build.
 *
 * The ESM build code-splits: `dist/esm.js` is the entry, backend-specific code
 * (`gpu-*`, `webgpu-engine`, post backends, texture upload) lands in
 * `dist/chunks/` and is fetched only by the backend the browser picked.
 * CJS and IIFE stay single-file — they inline every dynamic import.
 */

import type { BuildConfig } from "bun"
import { build } from "bun"
import dts from "bun-plugin-dts"
import { spawn } from "bun"
import { rm } from "node:fs/promises"

const option: BuildConfig = {
  entrypoints: ["./package/index.ts"],
  outdir: "./dist",
  minify: true,
  sourcemap: "external",
  plugins: [dts()],
}

async function run() {
  try {
    // Hashed chunk names change between builds — stale ones would ship in the tarball.
    await rm("./dist", { recursive: true, force: true })
    await Promise.all([
      build({
        ...option,
        format: "esm",
        splitting: true,
        naming: {
          entry: "[dir]/esm.js",
          chunk: "chunks/[name]-[hash].[ext]",
          asset: "chunks/[name]-[hash].[ext]",
        },
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
