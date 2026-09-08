/** Dev-only consumer transfer audit. Run after bin/build.ts. No source mutations.
 * Initial = generated static-import closure; emitted = includes lazy chunks.
 * gzip level 9 per file, summed; not HTTP overhead or actual backend fetch totals.
 */
import { gzipSync } from "node:zlib"
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const temporary = mkdtempSync(resolve(tmpdir(), "shooosh-size-"))
const sizes = (files: string[]) => ({ files: files.length,
  rawBytes: files.reduce((n, file) => n + readFileSync(file).length, 0),
  gzipBytes: files.reduce((n, file) => n + gzipSync(readFileSync(file), { level: 9 }).length, 0) })
// Matches the static from/import forms emitted by this Bun build, not arbitrary JS.
function staticClosure(entry: string) {
  const seen = new Set<string>()
  function visit(file: string) {
    if (seen.has(file)) return
    seen.add(file)
    for (const match of readFileSync(file, "utf8").matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g))
      if (match[1]!.startsWith(".")) visit(resolve(dirname(file), match[1]!))
  }
  visit(entry); return [...seen]
}
const cases = [
  { name: "probeRenderer", imports: [["probeRenderer", "dist/esm.js"]] },
  { name: "createItem", imports: [["createItem", "dist/esm.js"]] },
  { name: "createScene", imports: [["createScene", "dist/esm.js"]] },
  { name: "createDomLayer", imports: [["createDomLayer", "dist/dom/esm.js"]] },
  { name: "scene+dom", imports: [["createScene", "dist/esm.js"], ["createDomLayer", "dist/dom/esm.js"]] },
]
try {
  const consumers = []
  for (const fixture of cases) {
    const entry = resolve(temporary, `${fixture.name}.ts`)
    writeFileSync(entry, fixture.imports.map(([symbol, path]) => `import {${symbol}} from ${JSON.stringify(resolve(root, path!))};`).join("\n")
      + `\nglobalThis.__auditExports = [${fixture.imports.map(([symbol]) => symbol).join(",")}];`)
    const output = await Bun.build({ entrypoints: [entry], outdir: resolve(temporary, fixture.name), target: "browser", format: "esm", minify: true, splitting: true,
      naming: { entry: "entry.js", chunk: "[name]-[hash].js" } })
    if (!output.success) throw new Error(output.logs.map(String).join("\n"))
    const files = output.outputs.filter(file => file.path.endsWith(".js")).map(file => file.path)
    consumers.push({ name: fixture.name, initial: sizes(staticClosure(resolve(temporary, fixture.name, "entry.js"))), emitted: sizes(files) })
  }
  const hash = createHash("sha256")
  const fingerprintFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? fingerprintFiles(resolve(directory, entry.name)) : entry.name.endsWith(".js") ? [resolve(directory, entry.name)] : [])
  for (const file of fingerprintFiles(resolve(root, "dist")).sort()) hash.update(relative(root, file)).update("\0").update(readFileSync(file)).update("\0")
  console.log(JSON.stringify({ capturedAt: new Date().toISOString(), bun: Bun.version, platform: process.platform, arch: process.arch,
    distJavaScriptSha256: hash.digest("hex"), consumers }, null, 2))
} finally { rmSync(temporary, { recursive: true, force: true }) }
