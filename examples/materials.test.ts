import { shoooshShaders, shoooshBunShaders } from "../package/build/index"
import { gzipSync } from "node:zlib"
import { test, expect } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { convertWgslFragmentToGlsl } from "../package/compiler/index"
import { diffuseFragment, sheenFragment, fragment } from "./fabric-sheen"

for (const [name, shader] of Object.entries({ diffuseFragment, sheenFragment, fragment })) {
  test(`${name} converts to object GLSL`, () => {
    const glsl = convertWgslFragmentToGlsl(shader, { includeNormal: true, includeUv: true })
    expect(glsl).toContain("void main()")
    expect(glsl).not.toMatch(/\b(select|dpdx|dpdy|vec3f)\b/)
  })
}
test("Bun and Vite eliminate unselected material lobes and renderers", async () => {
  const folder = mkdtempSync(resolve(tmpdir(), "shooosh-materials-"))
  const { build } = await import("../harness/node_modules/vite/dist/node/index.js")
  try {
    for (const symbol of ["diffuseFragment", "sheenFragment"]) {
      const entry = resolve(folder, "entry.ts")
      const fabricPath = JSON.stringify(resolve(import.meta.dir, "materials/fabric.ts"))
      const sheenPath = JSON.stringify(resolve(import.meta.dir, "materials/sheen.ts"))
      writeFileSync(entry, `import {composeFabric} from ${fabricPath};
        ${symbol === "sheenFragment" ? `import {sheenWgsl} from ${sheenPath};` : ""}
        globalThis.material = ${symbol === "sheenFragment" ? 'composeFabric(sheenWgsl, "base + fabricSheen(n,l,v,rough) * uUni.values0.y")' : 'composeFabric()'};`)

      const bun = await Bun.build({ entrypoints: [entry], target: "browser", plugins: [shoooshBunShaders()], minify: true, splitting: true })
      expect(bun.success).toBe(true)
      const vite = await build({ configFile: false, plugins: [shoooshShaders()], root: folder, logLevel: "silent", build: {
        write: false, target: "esnext", rollupOptions: { input: entry },
      } })
      if (Array.isArray(vite) || !("output" in vite)) throw new Error("Unexpected Vite output")
      const outputs = [await Promise.all(bun.outputs.map(out => out.text())), vite.output.filter(out => out.type === "chunk").map(out => out.code)]
      for (const [index, chunks] of outputs.entries()) {
        console.log(`${index === 0 ? "Bun" : "Vite"} ${symbol}: ${gzipSync(chunks[0]!, { level: 9 }).length} gzip bytes`)
        expect(chunks.length).toBe(1)
        expect(chunks[0]).not.toMatch(/fabricCoat|createRenderPipeline|createShader|document\./)
        if (symbol === "diffuseFragment") expect(chunks[0]).not.toContain("fabricSheen")
        else expect(chunks[0]).toContain("fabricSheen")
        expect(chunks[0]!.length).toBeLessThan(5000)
      }
    }
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
