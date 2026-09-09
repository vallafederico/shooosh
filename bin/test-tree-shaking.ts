/** Consumer regressions for the published ESM package. Run after bin/build.ts.
 * Uses package exports/sideEffects through a real node_modules link, never source
 * aliases. Initial sizes sum gzip-9 of the static closure; emitted includes lazy
 * backend code and is reported separately. No network or extra dependencies.
 */
import { shoooshShaders, shoooshBunShaders } from "../package/build/index"
import { strict as assert } from "node:assert"
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { runInNewContext } from "node:vm"

const root = fileURLToPath(new URL("../", import.meta.url))
const { build: viteBuild } = await import(resolve(root, "harness/node_modules/vite/dist/node/index.js"))
const temporary = mkdtempSync(resolve(tmpdir(), "shooosh-shaking-"))
mkdirSync(resolve(temporary, "node_modules"))
symlinkSync(root, resolve(temporary, "node_modules/shooosh"), "dir")
writeFileSync(resolve(temporary, "package.json"), '{"type":"module","private":true}')

// Standalone primitive exports deliberately omit engine creation; Rollup can
// prove GPU frame state is never set in those incomplete consumer graphs. The
// runnable screen+engine and item+layer cases ensure GPU code remains available.
// Frozen transfer ceilings: deliberately allow modest minifier/version movement.
// These are initial static bytes, not a claim that lazy backend code is free.
type Fixture = { name: string; budget: number; code?: string; symbols?: string[]; dom?: boolean; gpu?: boolean; renderer?: string; example?: boolean; empty?: boolean; sameSizeAs?: string }
const fixtures: Fixture[] = [
  { name: "bare", code: 'globalThis.__fixture = 1;', empty: true, budget: 100 },
  { name: "all-browser-unused", code: 'import "shooosh"; import "shooosh/rig"; import "shooosh/utils"; import "shooosh/dom"; import "shooosh/webgpu"; import "shooosh/webgl2"; globalThis.__fixture = 1;', empty: true, budget: 100 },
  { name: "rig-unused-namespace", code: 'import * as rig from "shooosh/rig"; globalThis.__fixture = 1;', empty: true, budget: 100 },
  { name: "rig-unused-example", code: `import {run} from ${JSON.stringify(resolve(root, "examples/rig-bones.ts"))}; globalThis.__fixture = 1;`, example: true, empty: true, budget: 100 },
  { name: "rig-unused-barrel", code: `import {runRigBones} from ${JSON.stringify(resolve(root, "examples/index.ts"))}; globalThis.__fixture = 1;`, example: true, empty: true, budget: 100 },
  { name: "unused", code: 'import {createScene} from "shooosh"; import "shooosh"; globalThis.__fixture = 1;', budget: 100 },
  { name: "utility-unused", code: 'import {createSpinner} from "shooosh/utility"; import "shooosh/utility"; globalThis.__fixture = 1;', budget: 100 },
  { name: "compiler", code: 'import {compileShader} from "shooosh/compiler"; globalThis.__fixture = [compileShader];', budget: 8000 },
  { name: "rig-unused", code: 'import {createRig} from "shooosh/rig"; import "shooosh/rig"; globalThis.__fixture = 1;', budget: 100 },
  { name: "rig", code: 'import {createRig} from "shooosh/rig"; globalThis.__fixture = [createRig];', budget: 6000 },
  { name: "rig-animation", code: 'import {createRigAnimator} from "shooosh/rig"; globalThis.__fixture = [createRigAnimator];', budget: 3000 },
  { name: "utils", code: 'import {poseToTransform} from "shooosh/utils"; globalThis.__fixture = [poseToTransform];', budget: 1000 },
  { name: "utils-vector", code: 'import {rotateVector3} from "shooosh/utils"; globalThis.__fixture = [rotateVector3];', budget: 500 },
  { name: "utils-unused", code: 'import "shooosh/utils"; globalThis.__fixture = 1;', budget: 100 },
  { name: "utility", code: 'import {createSpinner} from "shooosh/utility"; globalThis.__fixture = [createSpinner];', budget: 1500 },
  { name: "probe", symbols: ["probeRenderer"], budget: 550 },
  { name: "screen", symbols: ["createScreen"], budget: 8500 },
  { name: "screen+engine", symbols: ["createScreen", "initEngine"], gpu: true, renderer: "createGpuFullscreenPlaneRenderer", budget: 10000 },
  { name: "item+layer", symbols: ["createItem", "acquireLayer"], gpu: true, renderer: "createGpuItemRenderer", budget: 10200 },
  { name: "canvas-scene", symbols: ["createCanvasScene"], gpu: true, budget: 11000 },
  { name: "scene", symbols: ["createScene"], gpu: true, budget: 21000 },
  { name: "scene+unused-rig", code: 'import {createScene} from "shooosh"; import * as unusedRig from "shooosh/rig"; globalThis.__fixture = [createScene];', gpu: true, sameSizeAs: "scene", budget: 21000 },
  { name: "item", symbols: ["createItem"], budget: 8700 },
  { name: "dom", dom: true, gpu: true, budget: 15500 },
  { name: "combined", symbols: ["createScene"], dom: true, gpu: true, budget: 26000 },
  ...[
    ["gradient-run", "gradient.ts", "run", 21000],
    ["physics-3d", "physics-3d.ts", "run", 26000],
    ["physics-pile", "physics-pile.ts", "run", 25000],
    ["physics-pendulum", "physics-pendulum.ts", "run", 25000],
    ["physics-barrel", "index.ts", "runPhysicsPile", 25000],
    ["plasma-fragment", "plasma.ts", "fragment", 600],
    ["plasma-barrel", "index.ts", "plasmaFragment", 600],
    ["glass-run", "refractive-glass.ts", "run", 24000],
    ["glass-barrel", "index.ts", "runRefractiveGlass", 24000],
    ["sss-run", "sss.ts", "run", 8500],
    ["sss-barrel", "index.ts", "runSss", 8500],
    ["ssao-run", "ssao.ts", "run", 8500],
    ["ssao-barrel", "index.ts", "runSsao", 8500],
    ["fabric-run", "fabric-sheen.ts", "run", 24000],
    ["fabric-barrel", "index.ts", "runFabricSheen", 24000],
  ].map(([name, file, symbol, budget]) => ({ name: String(name), budget: Number(budget), example: true,
    code: `import {${symbol}} from ${JSON.stringify(resolve(root, "examples", String(file)))}; globalThis.__fixture = [${symbol}];` })),
  { name: "global", code: `import ${JSON.stringify(resolve(root, "dist/shooosh.min.js"))};`, budget: 48000 },
]
type Chunk = { name: string; code: string; imports: string[]; entry: boolean }
function staticImports(code: string) {
  // Only the regular static forms generated by Bun (not an arbitrary JS parser).
  return [...code.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(match => match[1]!)
}
function sizes(chunks: Chunk[]) {
  return { files: chunks.length, raw: chunks.reduce((n,c) => n + Buffer.byteLength(c.code), 0),
    gzip: chunks.reduce((n,c) => n + gzipSync(c.code, { level: 9 }).length, 0) }
}
function closure(chunks: Chunk[]) {
  const seen = new Set<Chunk>()
  function visit(chunk: Chunk) {
    if (seen.has(chunk)) return
    seen.add(chunk)
    for (const imported of chunk.imports) {
      const dependency = chunks.find(candidate => candidate.name === imported || candidate.name === resolve(dirname(chunk.name), imported))
      assert(dependency, `Unresolved static output import ${imported}`)
      visit(dependency)
    }
  }
  const entry = chunks.find(chunk => chunk.entry)
  assert(entry, "Missing entry chunk")
  visit(entry)
  return [...seen]
}
const emptyOutputs = new Map<string,string>()
const consumerSizes = new Map<string,unknown>()
let failed = 0
try {
  for (const fixture of fixtures) {
    // Paired consumers use the same basename: Bun includes it in shared chunk names.
    const entry = resolve(temporary, `${fixture.sameSizeAs ?? fixture.name}.js`)
    const symbols = fixture.symbols ?? []
    writeFileSync(entry, fixture.code ?? `${symbols.length ? `import {${symbols.join(",")}} from "shooosh";` : ""}
${fixture.dom ? 'import {createDomLayer} from "shooosh/dom";' : ""}
globalThis.__fixture = [${[...symbols, ...(fixture.dom ? ["createDomLayer"] : [])].join(",")}];`)
    for (const bundler of ["bun", "vite"] as const) {
      try {
        let chunks: Chunk[]
        if (bundler === "bun") {
          const output = await Bun.build({ entrypoints: [entry], target: "browser", format: "esm", minify: true,
            splitting: true, outdir: resolve(temporary, `${fixture.name}-bun`), naming: { entry: "entry.js", chunk: "[name]-[hash].js" },
            plugins: "example" in fixture ? [shoooshBunShaders(),{ name: "published-example-imports", setup(build) {
              build.onResolve({ filter: /^shooosh(?:\/(?:dom|utility))?$/ }, args => ({ path: resolve(root, args.path === "shooosh" ? "dist/esm.js" : `dist/${args.path.split("/")[1]}/esm.js`) }))
            } }] : [] })
          assert(output.success, output.logs.map(String).join("\n"))
          chunks = await Promise.all(output.outputs.filter(file => file.path.endsWith(".js")).map(async file => {
            const code = await file.text()
            return { name: file.path, code, imports: staticImports(code), entry: file.kind === "entry-point" }
          }))
        } else {
          const output = await viteBuild({ configFile: false, root: temporary, logLevel: "silent", publicDir: false, plugins: [shoooshShaders()],
            resolve: "example" in fixture ? { alias: ["dom", "utility", "utils", "rig", "compiler", ""].map(subpath => ({
              find: subpath ? `shooosh/${subpath}` : "shooosh", replacement: resolve(root, subpath ? `dist/${subpath}/esm.js` : "dist/esm.js"),
            })) } : undefined,
            build: { write: false, minify: "esbuild", target: "esnext", modulePreload: false,
              rollupOptions: { input: entry, output: { format: "es", entryFileNames: "entry.js" } } } })
          assert(!Array.isArray(output) && "output" in output, "Unexpected Vite output")
          chunks = output.output.filter((file: any) => file.type === "chunk").map((file: any) =>
            ({ name: file.fileName, code: file.code, imports: file.imports, entry: file.isEntry }))
        }
        const initial = sizes(closure(chunks))
        const emitted = sizes(chunks)
        const measured = { initial, emitted }
        if (fixture.sameSizeAs) assert.deepEqual(measured, consumerSizes.get(`${bundler}/${fixture.sameSizeAs}`), "Unused optional import changed a live consumer bundle")
        consumerSizes.set(`${bundler}/${fixture.name}`, measured)
        console.log(`${bundler.padEnd(4)} ${fixture.name.padEnd(8)} initial ${JSON.stringify(initial)} emitted ${JSON.stringify(emitted)}`)
        assert(initial.gzip <= fixture.budget, `${initial.gzip} gzip bytes exceeds ${fixture.budget} ceiling`)
        const source = chunks.map(chunk => chunk.code).join("\n")
        const emptyConsumer = fixture.empty || fixture.name === "unused" || fixture.name.endsWith("-unused")
        if (fixture.name === "bare") emptyOutputs.set(bundler, source)
        if (emptyConsumer) assert.equal(source, emptyOutputs.get(bundler), "Unused import added bytes beyond the bare application")
        if (!fixture.name.startsWith("rig")) assert(!/Cyclic rig hierarchy|Duplicate animation channel|Incorrect palette output length/.test(source), "Rig leaked into unrelated consumer")
        if (fixture.name === "rig") assert(!/CUBICSPLINE|Skin matrix exceeds/.test(source), "Bone-only entry retained animation or palette code")
        if (fixture.name === "rig-animation") assert(!/Cyclic rig hierarchy|Skin matrix exceeds/.test(source), "Sampler retained rig construction or palette code")
        if (fixture.name === "canvas-scene") {
          assert(!/createGpuObjectRenderer|createWebGpuPostBackend|createWebGl2PostBackend|uploadWebGl2Texture|uploadWebGpuTexture/.test(source), "Optional scene conveniences leaked")
        }
        if (fixture.name !== "compiler") assert(!source.includes("Unable to locate fsMain"), "Compiler leaked into a runtime/example fixture")
        assert(!/msdf-bmfont-xml|generateFontAtlas|generateIconSdf/.test(source), "Node font tools leaked into browser consumer")
        const physics = fixture.name.startsWith("physics-")
        if (physics) {
          assert(/WebAssembly/.test(source), "Physics lost WASM runtime")
          assert(!/WebAssembly/.test(closure(chunks).map(chunk => chunk.code).join("\n")), "Rapier leaked into initial download")
          assert(emitted.gzip < (fixture.name === "physics-3d" ? 1200000 : 900000), "Physics exceeded optional download budget")
        } else assert(!/WebAssembly/.test(source), "Rapier leaked into unrelated consumer")
        if (emptyConsumer || fixture.name === "probe" || fixture.name.startsWith("utility") || fixture.name.startsWith("utils") || fixture.name.startsWith("rig")) {
          assert.equal(chunks.length, 1, "Tiny consumer retained lazy renderer chunks")
          assert(!/\bimport\s*\(/.test(source), "Tiny consumer retained dynamic renderer imports")
          assert(!/createShader|createRenderPipeline|GPUBufferUsage|DomLayer/.test(source), "Tiny consumer retained renderer implementation")
          const context: Record<string, any> = {}
          runInNewContext(source, context)
          assert(emptyConsumer ? context.__fixture === 1 : typeof context.__fixture?.[0] === "function", "Tiny consumer behavior missing")
        }
        if ("example" in fixture && !emptyConsumer) {
          assert(!/dom-lab|fn sample_field|mountCanvasInput/.test(source), "Unrelated DOM/fluid examples retained")
          if (fixture.name.startsWith("plasma")) {
            assert.equal(chunks.length, 1, "Fragment retained renderer chunks")
            assert(!/createShader|createRenderPipeline|glassBox/.test(source), "Fragment retained unrelated runtime")
            const context: Record<string, any> = {}; runInNewContext(source, context)
            assert.equal(typeof context.__fixture?.[0], "string")
          } else if (fixture.name.startsWith("sss-") || fixture.name.startsWith("ssao-")) {
            assert(/createComputePipeline/.test(source), "Compute shader example lost its backend")
            assert(!/glassBox/.test(source), "Shader lab retained unrelated glass material")
            if (fixture.name.startsWith("sss-")) assert(!/occlusion\/f32/.test(source), "SSS retained SSAO sampling")
            else assert(!/profile=exp/.test(source), "SSAO retained SSS diffusion")
          } else if (fixture.name.startsWith("fabric-")) {
            assert(/fabricSheen/.test(source) && /fabricCoat/.test(source) && /createRenderPipeline/.test(source), "Fabric lost its materials or GPU renderer")
            assert(!/glassBox|createComputePipeline/.test(source), "Fabric retained an unrelated glass/compute demo")
          } else if (fixture.name === "gradient-run") {
            assert(!source.includes("Unable to locate fsMain"), "Precompiled example retained converter");
          } else if (physics) {
            assert(/createRenderPipeline/.test(source), "Physics lost its renderer")
          } else assert(/glassBox/.test(source) && /createRenderPipeline/.test(source), "Glass lost its shader or GPU backend")
        }
        if (fixture.name === "utils-vector") assert(!/atan2|asin/.test(source), "Vector helper retained Euler math")
        if (fixture.name === "dom" || fixture.name === "item+layer" || fixture.name === "utils-unused") {
          assert(!/Math\.atan2|Math\.asin/.test(source), "Flat consumer retained optional transform math")
        }
        if (!fixture.example && fixture.name !== "compiler") assert(!source.includes("Unable to locate fsMain"), "Runtime consumer retained shader converter");
        if (fixture.name === "compiler") assert(source.includes("Unable to locate fsMain"), "Explicit compiler lost conversion logic");
        if (fixture.gpu) {
          assert(/createShaderModule/.test(source) && /createRenderPipeline/.test(source), "Runnable consumer lost GPU pipeline construction")
          assert(chunks.some(chunk => !chunk.entry && /createShaderModule|createRenderPipeline/.test(chunk.code)), "GPU pipeline unexpectedly missing from lazy output")
        }
        if (fixture.renderer) {
          const renderer = chunks.find(chunk => !chunk.entry && chunk.code.includes(fixture.renderer!) && chunk.code.includes("setBindGroup"))
          assert(renderer && renderer.code.includes("setBindGroup"), `Lost renderer implementation: ${fixture.renderer}`)
        }
        if (fixture.name === "global") {
          assert.equal(chunks.length, 1, "Global build unexpectedly needs external chunks")
          const context: Record<string, any> = { window: {} }
          runInNewContext(source, context)
          assert.equal(typeof context.window.Shooosh?.createScene, "function", "Bundler dropped global entry side effect")
          assert.equal(typeof context.window.Shooosh?.createItem, "function")
        }
      } catch (error) {
        failed++
        console.error(`FAIL ${bundler}/${fixture.name}: ${error}`)
      }
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
if (failed) throw new Error(`${failed} tree-shaking consumer checks failed`)
console.log(`All ${fixtures.length * 2} tree-shaking consumer checks passed.`)
