/**
 * bun test preload — resolve `shooosh` to package source (not dist/).
 */
import { plugin } from "bun"
import { shoooshBunShaders } from "../package/build/index"
plugin(shoooshBunShaders({ minify: false }))
import { resolve } from "node:path"

plugin({
  name: "shooosh-src",
  setup(build) {
    build.onResolve({ filter: /^shooosh\/dom$/ }, () => ({ path: resolve(import.meta.dir, "../package/dom/index.ts") }))
    build.onResolve({ filter: /^shooosh\/compiler$/ }, () => ({ path: resolve(import.meta.dir, "../package/compiler/index.ts") }))
    build.onResolve({ filter: /^shooosh\/utils$/ }, () => ({
      path: resolve(import.meta.dir, "../package/utils/index.ts"),
    }))
    build.onResolve({ filter: /^shooosh$/ }, () => ({
      path: resolve(import.meta.dir, "../package/index.ts"),
    }))
  },
})
