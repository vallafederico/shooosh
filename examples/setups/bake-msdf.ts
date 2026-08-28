/**
 * Bake font atlases + icon SDFs. Node / Bun only.
 *
 *   bun run examples/setups/bake-msdf.ts public/msdf fonts icons
 *   pnpm msdf -- fonts/Inter.ttf icons/ --out public/msdf
 *
 * Docs: docs/msdf.md
 */

import { generateMsdf } from "shooosh/msdf"

const outDir = process.argv[2] ?? "public/msdf"
const inputs = process.argv.slice(3)
const sources = inputs.length > 0 ? inputs : ["fonts", "icons"]

const results = await generateMsdf(sources, { outDir })
for (const result of results) {
  if (result.kind === "font") console.log("font", result.result.jsonPath)
  else if (result.kind === "icon") console.log("icon", result.result.pngPath)
  else console.log(result.kind, result.source, result.reason)
}
