/** Rebuild committed core in isolation and fail on browser payload or dependency drift. */
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, readdir, writeFile, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { build } from "esbuild"
const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const baseline = await mkdtemp(join(tmpdir(), "model-boundary-baseline-"))
const baselineRef = process.argv[2] ?? "HEAD"
async function fingerprint(directory) {
  const list = []
  async function walk(path) {
    for (const file of await readdir(path, { withFileTypes: true })) {
      const p = join(path, file.name)
      if (file.isDirectory() && relative(directory,p) !== "rig") await walk(p)
      else if (file.name.endsWith(".js")) list.push(p)
    }
  }
  await walk(directory)
  const hash = createHash("sha256")
  let bytes = 0
  for (const path of list.sort()) {
    const data = await readFile(path)
    bytes += data.length
    hash.update(relative(directory, path)).update("\0").update(data).update("\0")
  }
  return { sha256: hash.digest("hex"), files: list.length, bytes }
}
try {
  const archive = join(baseline, "source.tar")
  execFileSync("git", ["archive", baselineRef, "--output", archive], { cwd: root })
  execFileSync("tar", ["-xf", archive, "-C", baseline])
  await symlink(join(root, "node_modules"), join(baseline, "node_modules"))
  await symlink(
    join(root, "harness/node_modules"),
    join(baseline, "harness/node_modules"),
  )
  execFileSync("bun", ["run", "bin/build.ts"], {
    cwd: baseline,
    stdio: "pipe",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  })
  const before = await fingerprint(join(baseline, "dist")),
    after = await fingerprint(join(root, "dist"))
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Core dist JavaScript differs from baseline")
  const bundleAudit = (path) =>
    JSON.parse(
      execFileSync("bun", ["bin/audit-bundle.ts"], { cwd: path, encoding: "utf8" }),
    )
  const beforeConsumers = bundleAudit(baseline),
    afterConsumers = bundleAudit(root)
  if (
    JSON.stringify(beforeConsumers.consumers) !== JSON.stringify(afterConsumers.consumers)
  )
    throw new Error("Consumer sizes differ from baseline")
  const bare = await build({
    stdin: { contents: "globalThis.auditUnused = 1", resolveDir: root },
    bundle: true, platform: "browser", format: "esm", minify: true, write: false, logLevel: "silent",
  })
  const consumers = []
  for (const [name, entry] of [
    ["core", "dist/esm.js"],
    ["dom", "dist/dom/esm.js"],
    ["webgpu", "dist/webgpu/esm.js"],
    ["webgl2", "dist/webgl2/esm.js"],
    ["rig", "dist/rig/esm.js"],
    ["model-controller", "packages/model/dist/runtime.js"],
    ["model-shooosh", "packages/model/dist/shooosh.js"],
  ]) {
    const result = await build({
      stdin: {
        contents: `import * as api from ${JSON.stringify(join(root, entry))}; globalThis.auditAPI = api;`,
        resolveDir: root,
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      minify: true,
      metafile: true,
      write: false,
      logLevel: "silent",
    })
    const forbidden = Object.keys(result.metafile.inputs).filter((path) =>
      /node:|gltf-transform|assimp|sharp|draco|meshoptimizer|texture2ddecoder|convert-worker|texture-tools|local-resources/.test(
        path,
      ),
    )
    if (forbidden.length)
      throw new Error(`${name} leaks Node processing: ${forbidden.join(", ")}`)
    const unused = await build({
      stdin: { contents: `import * as unused from ${JSON.stringify(join(root, entry))}; globalThis.auditUnused = 1`, resolveDir: root },
      bundle: true, platform: "browser", format: "esm", minify: true, write: false, logLevel: "silent",
    })
    if (unused.outputFiles[0].text !== bare.outputFiles[0].text)
      throw new Error(`${name} adds bytes when unused`)
    const bytes = result.outputFiles[0].contents
    consumers.push({
      name,
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
      modules: Object.keys(result.metafile.inputs).length,
      forbidden,
      unusedBytesAdded: 0,
    })
  }
  let rejectsNodeEntry = false
  try {
    await build({
      stdin: {
        contents: "import * as api from 'shooosh-model/node';globalThis.api=api",
        resolveDir: join(root, "packages/model"),
      },
      bundle: true,
      platform: "browser",
      write: false,
      logLevel: "silent",
    })
  } catch {
    rejectsNodeEntry = true
  }
  if (!rejectsNodeEntry) throw new Error("Node entry unexpectedly builds for browser")
  const report = {
    baselineRef: execFileSync("git", ["rev-parse", baselineRef], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    core: after,
    coreIdentical: true,
    consumerSizesIdentical: true,
    transferCases: afterConsumers.consumers,
    browserGraphs: consumers,
    rejectsNodeEntry,
    notes:
      "Same Bun and installed dependency versions for both builds. Optional rig/model-controller/adapter are measured separately; they are not included in core.",
  }
  await writeFile(
    new URL("./boundary-results.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  )
  console.log(JSON.stringify(report, null, 2))
} finally {
  await rm(baseline, { recursive: true, force: true })
}
