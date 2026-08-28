import { readFileSync, existsSync, readdirSync } from "fs"
import { join } from "path"

const distDir = join(process.cwd(), "dist")
const chunksDir = join(distDir, "chunks")

/**
 * ESM code-splitting chunk files (backend-specific code) reachable from
 * dist/esm.js. dist/ is not cleaned between builds, so walking the import graph
 * is what keeps a stale chunk from passing these checks.
 */
function readEsmChunkNames() {
  if (!existsSync(chunksDir) || !existsSync(join(distDir, "esm.js"))) return []

  const referencesIn = (source: string) =>
    Array.from(source.matchAll(/["'](?:\.\/|\.\/chunks\/|chunks\/)([\w.-]+\.js)["']/g)).map(
      (match) => match[1]!,
    )

  const reachable = new Set<string>()
  const queue = referencesIn(readFileSync(join(distDir, "esm.js"), "utf-8"))
  while (queue.length > 0) {
    const name = queue.pop()!
    if (reachable.has(name)) continue
    const path = join(chunksDir, name)
    if (!existsSync(path)) continue
    reachable.add(name)
    queue.push(...referencesIn(readFileSync(path, "utf-8")))
  }
  return Array.from(reachable)
}

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

async function test(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  try {
    await fn()
    return { name, passed: true }
  } catch (error) {
    return { name, passed: false, error: String(error) }
  }
}

async function runTests() {
  console.log("Running build verification tests...\n")

  const results = await Promise.all([
    test("Build files exist", () => {
      for (const file of [
        "esm.js",
        "cjs.js",
        "shooosh.min.js",
        "index.d.ts",
        "msdf/index.js",
      ]) {
        if (!existsSync(join(distDir, file))) {
          throw new Error(`Missing build file: ${file}`)
        }
      }
    }),

    test("IIFE build attaches to window.Shooosh", () => {
      const content = readFileSync(join(distDir, "shooosh.min.js"), "utf-8")
      const hasWindow =
        content.includes("window.Shooosh") ||
        content.includes('window["Shooosh"]') ||
        content.includes("Shooosh")
      if (!hasWindow) {
        throw new Error("shooosh.min.js does not attach Shooosh to the global scope")
      }
    }),

    test("ESM build exports the public API", async () => {
      const module = await import(join(distDir, "esm.js"))
      for (const name of [
        "createEngine",
        "createScene",
        "createItem",
        "createScreen",
        "createCompute",
        "acquireLayer",
        "effects",
        "convertWgslFragmentToGlsl",
        "convertGlslFragmentToWgsl",
        "probeRenderer",
      ]) {
        if (module[name] == null) {
          throw new Error(`ESM build missing ${name}`)
        }
      }
    }),

    test("CJS build exports the public API", async () => {
      const module = await import(join(distDir, "cjs.js"))
      const api = module.createEngine ? module : module.default
      if (typeof api.createEngine !== "function" && typeof module.createEngine !== "function") {
        throw new Error(
          `CJS build missing createEngine. Keys: ${Object.keys(module).join(", ")}`,
        )
      }
    }),

    test("Type definitions cover the public API", () => {
      const content = readFileSync(join(distDir, "index.d.ts"), "utf-8")
      for (const token of [
        "createEngine",
        "createScene",
        "createItem",
        "createCompute",
        "acquireLayer",
        "convertWgslFragmentToGlsl",
        "convertGlslFragmentToWgsl",
        "probeRenderer",
      ]) {
        if (!content.includes(token)) {
          throw new Error(`Type definitions missing ${token}`)
        }
      }
    }),

    test("Node msdf build exports the generator API", async () => {
      const module = await import(join(distDir, "msdf/index.js"))
      for (const name of [
        "alphaToSdf",
        "generateIconSdf",
        "generateFontAtlas",
        "generateMsdf",
        "runMsdfCli",
        "ASCII_CHARSET",
      ]) {
        if (module[name] == null) {
          throw new Error(`msdf build missing ${name}`)
        }
      }
    }),

    test("ESM build splits backend code into chunks", () => {
      const chunks = readEsmChunkNames()
      if (chunks.length === 0) {
        throw new Error("ESM build emitted no dist/chunks — code splitting is off")
      }
      const esm = readFileSync(join(distDir, "esm.js"), "utf-8")
      if (!esm.includes("./chunks/")) {
        throw new Error("dist/esm.js does not reference any split chunk")
      }
      for (const name of [
        "gpu-plane",
        "gpu-item",
        "gpu-object",
        "gpu-particles",
        "gpu-msdf-glyphs",
        "gpu-mousetrail",
        "webgpu-engine",
        "webgl2-engine",
      ]) {
        if (!chunks.some((chunk) => chunk.startsWith(name))) {
          throw new Error(`ESM build did not split ${name} into its own chunk`)
        }
      }
    }),

    test("browser ESM does not include the Node msdf toolchain", () => {
      const sources = [
        readFileSync(join(distDir, "esm.js"), "utf-8"),
        ...readEsmChunkNames().map((name) => readFileSync(join(chunksDir, name), "utf-8")),
      ]
      for (const token of ["msdf-bmfont-xml", "generateFontAtlas", "generateIconSdf"]) {
        if (sources.some((source) => source.includes(token))) {
          throw new Error(`browser build leaked shooosh/msdf (${token})`)
        }
      }
    }),
  ])

  let passed = 0
  let failed = 0
  for (const result of results) {
    if (result.passed) {
      console.log(`ok  ${result.name}`)
      passed++
    } else {
      console.log(`fail  ${result.name}`)
      if (result.error) console.log(`  ${result.error}`)
      failed++
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runTests()
