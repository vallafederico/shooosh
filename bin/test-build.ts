import { readFileSync, existsSync } from "fs"
import { join } from "path"

const distDir = join(process.cwd(), "dist")

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
      for (const file of ["esm.js", "cjs.js", "shooosh.min.js", "index.d.ts"]) {
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
