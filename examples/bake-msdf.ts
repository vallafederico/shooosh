/**
 * Bake font atlases + icon SDFs. Node / Bun only.
 *
 * When: you need assets for createMsdfGlyphs or an SDF logo quad.
 * Do not import shooosh/msdf from a site bundle.
 *
 *   pnpm add -D sharp msdf-bmfont-xml
 *   bun run examples/bake-msdf.ts
 *   pnpm msdf -- fonts/Inter.ttf icons/ --out public/msdf
 *
 * Fonts default to fieldType "sdf". Hairline faces want fontSize 256.
 *
 * Docs: docs/msdf.md · skill shooosh-msdf
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
