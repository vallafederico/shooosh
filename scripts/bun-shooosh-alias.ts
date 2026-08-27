/**
 * bun test preload — resolve `shooosh` to package source (not dist/).
 */
import { plugin } from "bun"
import { resolve } from "node:path"

plugin({
  name: "shooosh-src",
  setup(build) {
    build.onResolve({ filter: /^shooosh$/ }, () => ({
      path: resolve(import.meta.dir, "../package/index.ts"),
    }))
  },
})
