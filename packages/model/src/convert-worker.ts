import { localResource } from "./local-resources.js"
import { normalizeImportedTransforms } from "./import-repair.js"
import { optimizeTextures } from "./textures.js"
/** Implementation detail: never imported into the browser. */
import { parentPort, workerData } from "node:worker_threads"
import { readFileSync, existsSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { createRequire } from "node:module"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { createModelIO, openModel } from "./node.js"
import * as validator from "gltf-validator"

async function convert() {
  const { input, format, resourceDirectory } = workerData
  const io = await createModelIO()
  let document
  const warnings: string[] = []
  if (format === "glb" || format === "gltf") {
    document = (await openModel(input)).document
  } else {
    const assimp = await createRequire(import.meta.url)("assimpjs")()
    const base = resourceDirectory ?? dirname(input)
    const localPath = (name: string) => localResource(base, name)
    const missing = new Set<string>()
    const result = assimp.ConvertFile(
      basename(input),
      "gltf2",
      readFileSync(input),
      (name: string) => {
        let exists = false
        try {
          exists = existsSync(localPath(name))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        if (!exists) missing.add(name)
        return exists
      },
      (name: string) => readFileSync(localPath(name)),
    )
    if (!result.IsSuccess() || !result.FileCount())
      throw new Error(`Assimp could not convert ${format}: ${result.GetErrorCode()}`)
    const resources: Record<string, Uint8Array<ArrayBuffer>> = {}
    let json: any
    for (let i = 0; i < result.FileCount(); i++) {
      const file = result.GetFile(i)
      const content = new Uint8Array(file.GetContent())
      if (file.GetPath().endsWith(".gltf"))
        json = JSON.parse(new TextDecoder().decode(content))
      else resources[file.GetPath()] = content
    }
    if (!json) throw new Error("Converter returned no glTF document")
    for (const item of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      if (item.uri && !item.uri.startsWith("data:") && !resources[item.uri]) {
        try {
          resources[item.uri] = new Uint8Array(readFileSync(localPath(item.uri)))
        } catch {
          throw new Error(
            `Missing external resource: ${item.uri}. Keep source materials/textures beside the model or set resourceDirectory.`,
          )
        }
      }
    }
    // Assimp may continue without an OBJ material library; do not silently discard it.
    if (format === "obj") {
      for (const line of readFileSync(input, "utf8").split(/\r?\n/)) {
        if (/^\s*mtllib\s+/.test(line)) {
          const name = line.replace(/^\s*mtllib\s+/, "").trim()
          if (!existsSync(localPath(name)))
            throw new Error(`Missing OBJ material library: ${name}`)
        }
      }
    }
    const supported = new Set(ALL_EXTENSIONS.map((extension) => extension.EXTENSION_NAME))
    const omitted = (json.extensionsUsed ?? []).filter(
      (name: string) => !supported.has(name),
    )
    if (omitted.length)
      warnings.push(`Converter metadata extensions omitted: ${omitted.join(", ")}`)
    document = await io.readJSON({ json, resources })
    const repaired = normalizeImportedTransforms(document)
    if (repaired.rotations || repaired.weights)
      warnings.push(
        `Normalized ${repaired.rotations} imported rotation samples and ${repaired.weights} vertex weight sets`,
      )
    warnings.push(
      "Assimp conversion is best effort: verify units, axes, materials, hierarchy and animation against the source. Native application features are not preserved.",
    )
    if (missing.size)
      warnings.push(`Importer probed unavailable resources: ${[...missing].join(", ")}`)
  }
  const textures =
    workerData.textures === false
      ? undefined
      : await optimizeTextures(document, workerData.textures)
  const bytes = await io.writeBinary(document)
  const report = await validator.validateBytes(bytes, { maxIssues: 100 })
  if (report.issues.numErrors)
    throw new Error(
      `Converted GLB failed validation: ${JSON.stringify(report.issues.messages)}`,
    )
  parentPort!.postMessage({ bytes, warnings, textures, validation: report.issues })
}
convert().catch((error) =>
  parentPort!.postMessage({
    error: error instanceof Error ? error.message : String(error),
  }),
)
