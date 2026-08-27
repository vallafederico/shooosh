import type { BuildConfig } from "bun"
import { build } from "bun"

const option: BuildConfig = {
  entrypoints: ["./package/index.ts"],
  outdir: "./dist",
  minify: false,
  sourcemap: "external",
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
    ])
    console.log("Package built to dist/")
  } catch (error) {
    console.error("Build failed:", error)
    process.exit(1)
  }
}

run()
