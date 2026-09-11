import "./check-experiment-isolation";
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

import type { BuildConfig, BunPlugin } from "bun"
import { build } from "bun"
import dts from "bun-plugin-dts"
import { spawn } from "bun"
import { rm } from "node:fs/promises"
import { shaderModule } from "../package/build/index"

function builtinShaders(backend: "both" | "webgl2" | "webgpu"): BunPlugin {
  return { name: "builtin-shader-target", setup(builder) {
    builder.onLoad({ filter: /dom\/(image|box)-shader\.ts$/ }, async ({ path }) => ({
      contents: shaderModule(await Bun.file(path.replace(/-shader\.ts$/, ".wgsl")).text(), { backend, minify: true }), loader: "ts",
    }))
  } }
}

const option: BuildConfig = {
  entrypoints: ["./package/index.ts", "./package/dom/index.ts", "./package/utility/index.ts", "./package/utils/index.ts", "./package/compiler/index.ts"],
  outdir: "./dist",
  target: "browser",
  define: { __SHOOOSH_GPU__: "true", __SHOOOSH_GL__: "true" },
  minify: true,
  // This is a library build: preserve purity for the consumer's second bundle.
  // Whitespace minification otherwise strips these annotations.
  emitDCEAnnotations: true,
  sourcemap: "external",
  plugins: [builtinShaders("both"), dts()],
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
      ...(["webgl2", "webgpu"] as const).flatMap(backend => (["esm", "cjs"] as const).map(format => build({
        ...option,
        entrypoints: ["./package/index.ts", "./package/dom/index.ts"],
        outdir: `./dist/${backend}`,
        plugins: [builtinShaders(backend)],
        define: { __SHOOOSH_GPU__: String(backend === "webgpu"), __SHOOOSH_GL__: String(backend === "webgl2") },
        format, splitting: format === "esm",
        naming: { entry: `[dir]/${format}.js`, chunk: "chunks/[name]-[hash].[ext]" },
      }))),
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
        define: { __SHOOOSH_GPU__: "true", __SHOOOSH_GL__: "true" },
        minify: true,
        sourcemap: "none",
      }),
      // Separate build: new rig modules cannot alter the core shared chunk graph.
      ...(["esm", "cjs"] as const).map(format => build({
        entrypoints: ["./package/rig/index.ts"], outdir: "./dist/rig", target: "browser",
        format, naming: `${format}.js`, minify: true, emitDCEAnnotations: true,
        plugins: format === "esm" ? [dts()] : [],
      })),
      ...(["esm", "cjs"] as const).map(format => build({
        entrypoints: ["./package/build/index.ts"], outdir: "./dist/build", target: "node",
        format, naming: format === "esm" ? "esm.js" : "cjs.js", minify: true, plugins: [dts()],
      })),
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

    for (const cmd of [["bun", "run", "bin/example-shaders.ts", "--check"], ["bun", "run", "bin/test-build.ts"], ["bun", "run", "bin/test-backends.ts"], ["bun", "run", "bin/test-tree-shaking.ts"], ["bun", "run", "test:examples"]]) {
      const testProcess = spawn({ cmd, stdout: "inherit", stderr: "inherit" })
      if (await testProcess.exited !== 0) {
        console.error(`\nBuild verification failed: ${cmd.join(" ")}`)
        process.exit(1)
      }
    }
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

run()
