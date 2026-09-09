import { attributionHtml, type AssetAttribution } from "./attribution.js"
import { readFile } from "node:fs/promises"
import { textureComparisons, type CompareOptions } from "./texture-compare.js"
import { serveAssets } from "./server.js"
export async function serveTextureComparison(
  original: string,
  converted: string,
  options: CompareOptions & { port?: number; attribution?: AssetAttribution } = {},
) {
  const comparisons = await textureComparisons(original, converted, options)
  const assets = new Map<string, { type: string; body: string | Uint8Array }>()
  for (const [name, type] of [
    ["texture-viewer.html", "text/html"],
    ["texture-viewer.js", "text/javascript"],
    ["texture-viewer.css", "text/css"],
  ])
    assets.set(name.endsWith("html") ? "" : name, {
      type,
      body: await readFile(new URL(`./viewer/${name}`, import.meta.url)),
    })
  const page = assets.get("")!
  page.body = attributionHtml(Buffer.from(page.body).toString(), options.attribution)
  const items = comparisons.map((item, i) => {
    if (item.atlas) assets.set(`${i}.png`, { type: "image/png", body: item.atlas })
    return {
      name: item.name,
      report: item.report,
      error: "error" in item ? item.error : undefined,
      atlas: item.atlas ? `${i}.png` : undefined,
    }
  })
  assets.set("comparison.json", {
    type: "application/json",
    body: JSON.stringify({ original, converted, items }),
  })
  return serveAssets(assets, options.port)
}
