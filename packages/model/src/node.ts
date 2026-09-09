import { localResource } from "./local-resources.js"
/** Node-only IO and asset processing. Never imported from the runtime entry. */
import { open, readFile, writeFile, stat } from "node:fs/promises"
import { createReadStream } from "node:fs"
import { createHash } from "node:crypto"
import { resolve, dirname, extname } from "node:path"
import { NodeIO, type Document } from "@gltf-transform/core"
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions"
import { MeshoptDecoder } from "meshoptimizer/decoder"
import { MeshoptEncoder } from "meshoptimizer/encoder"
import draco from "draco3dgltf"
import * as validator from "gltf-validator"
import { inspectJson, type Gltf, type ModelManifest } from "./manifest.js"
import { validateMaterial, type MaterialPatch } from "./runtime.js"
export { inspectJson } from "./manifest.js"
export type { ModelManifest } from "./manifest.js"

export async function readMetadata(path: string): Promise<Gltf> {
  if (extname(path).toLowerCase() === ".gltf") {
    if ((await stat(path)).size > 64 * 1024 * 1024)
      throw new Error("Oversized glTF JSON (maximum 64 MiB)")
    return JSON.parse(await readFile(path, "utf8"))
  }
  const file = await open(path, "r")
  try {
    const size = (await file.stat()).size
    const header = Buffer.alloc(20)
    if (
      (await file.read(header, 0, 20, 0)).bytesRead !== 20 ||
      header.readUInt32LE(0) !== 0x46546c67 ||
      header.readUInt32LE(4) !== 2 ||
      header.readUInt32LE(8) !== size ||
      header.readUInt32LE(16) !== 0x4e4f534a
    )
      throw new Error("Invalid GLB 2.0 header")
    const length = header.readUInt32LE(12)
    if (length % 4 || length > size - 20 || length > 64 * 1024 * 1024)
      throw new Error("Invalid or oversized GLB JSON chunk (maximum 64 MiB)")
    const json = Buffer.alloc(length)
    if ((await file.read(json, 0, length, 20)).bytesRead !== length)
      throw new Error("Truncated GLB JSON")
    return JSON.parse(json.toString("utf8"))
  } finally {
    await file.close()
  }
}
export async function hashFile(path: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest("hex")
}
export async function inspectModel(path: string, options: { hash?: boolean } = {}) {
  return inspectJson(await readMetadata(path), options.hash ? await hashFile(path) : "")
}
export async function checkModel(path: string) {
  const bytes = await readFile(path)
  const base = dirname(resolve(path))
  const options = {
    uri: path,
    maxIssues: 200,
    externalResourceFunction: async (uri: string) => {
      return new Uint8Array(await readFile(localResource(base, uri)))
    },
  }
  return extname(path).toLowerCase() === ".gltf"
    ? validator.validateString(bytes.toString("utf8"), options)
    : validator.validateBytes(bytes, options)
}
class LocalModelIO extends NodeIO {
  protected override resolve(base: string, reference: string) {
    return localResource(base, reference)
  }
}
export async function createModelIO() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])
  return new LocalModelIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
    "draco3d.decoder": await draco.createDecoderModule(),
    "draco3d.encoder": await draco.createEncoderModule(),
  })
}
export async function openModel(
  path: string,
  options: { maxDecodedBytes?: number } = {},
) {
  const metadata = await readMetadata(path)
  inspectJson(metadata) // Reject invalid hierarchies before dependency parsing.
  const budget = options.maxDecodedBytes ?? 512 * 1024 * 1024
  if (!Number.isSafeInteger(budget) || budget < 1)
    throw new Error("Invalid maxDecodedBytes")
  let decodedBytes = 0
  for (const accessor of metadata.accessors ?? []) {
    const components = (
      { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 } as Record<
        string,
        number
      >
    )[accessor.type]
    if (!Number.isSafeInteger(accessor.count) || accessor.count < 0 || !components)
      throw new Error("Invalid accessor shape")
    decodedBytes += accessor.count * components * 4
    if (!Number.isSafeInteger(decodedBytes) || decodedBytes > budget)
      throw new Error(
        "Decoded accessor budget exceeded (default 512 MiB); use openModel maxDecodedBytes explicitly for trusted larger assets",
      )
  }
  const known = new Set(ALL_EXTENSIONS.map((e) => e.EXTENSION_NAME))
  const unknown = [
    ...(metadata.extensionsUsed ?? []),
    ...(metadata.extensionsRequired ?? []),
  ].filter((e) => !known.has(e))
  if (unknown.length)
    throw new Error(
      `Refusing to rewrite unsupported extensions: ${unknown.join(", ")}. Inspect still works.`,
    )
  const io = await createModelIO()
  const document = await io.read(path)
  return { io, document }
}
export type EditPatch = {
  nodes?: {
    id: number
    name?: string
    translation?: number[]
    rotation?: number[]
    scale?: number[]
    material?: MaterialPatch
  }[]
  materials?: ({ id: number } & MaterialPatch)[]
}
function vector(value: number[], length: number, label: string) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite))
    throw new Error(`Invalid ${label}`)
}
function applyMaterial(
  material: ReturnType<Document["createMaterial"]>,
  patch: MaterialPatch,
) {
  if (patch.color) material.setBaseColorFactor([...patch.color])
  if (patch.metallic !== undefined) material.setMetallicFactor(patch.metallic)
  if (patch.roughness !== undefined) material.setRoughnessFactor(patch.roughness)
}
/** Validate the complete patch before mutating. Per-node materials use copy-on-write. */
export function editDocument(document: Document, patch: EditPatch) {
  if (
    !patch ||
    typeof patch !== "object" ||
    Object.keys(patch).some((k) => !["nodes", "materials"].includes(k))
  )
    throw new Error("Expected a nodes/materials edit patch")
  if (
    (patch.nodes !== undefined && !Array.isArray(patch.nodes)) ||
    (patch.materials !== undefined && !Array.isArray(patch.materials))
  )
    throw new Error("Patch lists must be arrays")
  const nodes = document.getRoot().listNodes()
  const materials = document.getRoot().listMaterials()
  for (const edit of patch.nodes ?? []) {
    if (!Number.isInteger(edit.id) || !nodes[edit.id])
      throw new Error(`Unknown node ${edit.id}`)
    if (
      Object.keys(edit).some(
        (k) =>
          !["id", "name", "translation", "rotation", "scale", "material"].includes(k),
      )
    )
      throw new Error("Unknown node operation")
    if (edit.name !== undefined && typeof edit.name !== "string")
      throw new Error("Name must be a string")
    if (edit.translation) vector(edit.translation, 3, "translation")
    if (edit.scale) vector(edit.scale, 3, "scale")
    if (edit.rotation) {
      vector(edit.rotation, 4, "quaternion")
      if (Math.abs(Math.hypot(...edit.rotation) - 1) > 0.001)
        throw new Error("Rotation must be a unit quaternion")
    }
    if (edit.material) {
      validateMaterial(edit.material)
      if (!nodes[edit.id].getMesh()) throw new Error(`Node ${edit.id} has no mesh`)
    }
  }
  for (const { id, ...edit } of patch.materials ?? []) {
    if (!Number.isInteger(id) || !materials[id]) throw new Error(`Unknown material ${id}`)
    validateMaterial(edit)
  }
  for (const edit of patch.nodes ?? []) {
    const node = nodes[edit.id]
    if (edit.name !== undefined) node.setName(edit.name)
    if (edit.translation)
      node.setTranslation(edit.translation as [number, number, number])
    if (edit.rotation) node.setRotation(edit.rotation as [number, number, number, number])
    if (edit.scale) node.setScale(edit.scale as [number, number, number])
    if (edit.material) {
      const original = node.getMesh()!
      const mesh = original.clone()
      for (const primitive of mesh.listPrimitives()) mesh.removePrimitive(primitive)
      for (const primitive of original.listPrimitives()) {
        const copy = primitive.clone()
        const material = primitive.getMaterial()?.clone() ?? document.createMaterial()
        applyMaterial(material, edit.material)
        copy.setMaterial(material)
        mesh.addPrimitive(copy)
      }
      node.setMesh(mesh)
    }
  }
  for (const { id, ...edit } of patch.materials ?? []) applyMaterial(materials[id], edit)
}
/** Separate output files are mandatory; wx never overwrites an existing artifact. */
export async function writeNew(path: string, content: string | Uint8Array) {
  await writeFile(path, content, { flag: "wx" })
}
export async function editModel(input: string, output: string, patch: EditPatch) {
  if (extname(output).toLowerCase() !== ".glb") throw new Error("Output must be .glb")
  const { io, document } = await openModel(input)
  editDocument(document, patch)
  await writeNew(output, await io.writeBinary(document))
}
/** Lossless meshopt geometry compression plus configurable texture optimization. */
export async function compressModel(
  input: string,
  output: string,
  options: { textures?: false | import("./textures.js").TextureOptions } = {},
) {
  if (extname(output).toLowerCase() !== ".glb") throw new Error("Output must be .glb")
  const { io, document } = await openModel(input)
  const textures =
    options.textures === false
      ? undefined
      : await (await import("./textures.js")).optimizeTextures(document, options.textures)
  if (
    document
      .getRoot()
      .listAccessors()
      .some((accessor) => accessor.getCount() > 0)
  )
    document
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const bytes = await io.writeBinary(document)
  const validation = await validator.validateBytes(bytes, { maxIssues: 100 })
  if (validation.issues.numErrors)
    throw new Error(
      `Optimized GLB failed validation: ${JSON.stringify(validation.issues.messages)}`,
    )
  await writeNew(output, bytes)
  return {
    inputBytes: (await stat(input)).size,
    outputBytes: (await stat(output)).size,
    textures,
  }
}

/** Prepare decoded rigid geometry for shooosh. Inspection always retains the full scene. */
export async function prepareModel(input: string, options: { textures?: boolean } = {}) {
  const manifest = await inspectModel(input, { hash: true })
  const { document } = await openModel(input)
  const { createHash } = await import("node:crypto")
  const chunks: Uint8Array[] = []
  let offset = 0
  const geometry: import("./prepared.js").PreparedModel["geometry"] = []
  const limitations = [
    "Preview uses base-color textures and approximate metallic/roughness lighting. Normal, emissive and metallic/roughness maps, alpha blending, authored lights and cameras are not rendered.",
    "Skinned meshes and morph targets are omitted from the rigid preview. Animation clips are listed but playback is not supported.",
  ]
  const materials = document.getRoot().listMaterials()
  const materialIds = new Map(materials.map((m, i) => [m, i]))
  const previewTextures: NonNullable<import("./prepared.js").PreparedModel["textures"]> =
    []
  if (options.textures) {
    const sharp = (await import("sharp")).default
    const { processingTemp } = await import("./processing-temp.js")
    const { rm } = await import("node:fs/promises")
    const dir = await processingTemp("model-preview-")
    let pixels = 0
    try {
      for (const [material, value] of materials.entries()) {
        const texture = value.getBaseColorTexture()
        const image = texture?.getImage()
        if (!image) continue
        const info = value.getBaseColorTextureInfo()!
        if (info.getTexCoord() !== 0 || info.getExtension("KHR_texture_transform")) {
          limitations.push(
            `Material ${material}: textured preview requires TEXCOORD_0 without KHR_texture_transform; showing solid color.`,
          )
          continue
        }
        let bytes: Buffer = Buffer.from(image)
        if (texture!.getMimeType() === "image/ktx2") {
          const path = `${dir}/${material}.ktx2`
          await writeFile(path, bytes)
          bytes = await (await import("./texture-tools.js")).decodeTexture(path)
        }
        const { data, info: dimensions } = await sharp(bytes, {
          limitInputPixels: 16_777_216,
        })
          .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer({ resolveWithObject: true })
        pixels += dimensions.width * dimensions.height
        if (pixels > 16_777_216)
          throw new Error(
            "Preview texture budget exceeded (16 million pixels); optimize textures first",
          )
        const padding = (4 - (offset % 4)) % 4
        if (padding) {
          chunks.push(new Uint8Array(padding))
          offset += padding
        }
        previewTextures.push({
          material,
          offset,
          length: data.length,
          wrapS: info.getWrapS(),
          wrapT: info.getWrapT(),
        })
        chunks.push(data)
        offset += data.length
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  // Geometry remains 4-byte aligned after variable-length PNG payloads.
  const padding = (4 - (offset % 4)) % 4
  if (padding) {
    chunks.push(new Uint8Array(padding))
    offset += padding
  }
  for (const [meshId, mesh] of document.getRoot().listMeshes().entries()) {
    for (const [primitiveId, primitive] of mesh.listPrimitives().entries()) {
      if (primitive.getMode() !== 4 || primitive.listTargets().length) {
        limitations.push(
          `Skipped mesh ${meshId}, primitive ${primitiveId}: only static triangles are supported.`,
        )
        continue
      }
      const position = primitive.getAttribute("POSITION")
      if (!position) continue
      const normal = primitive.getAttribute("NORMAL")
      const texcoord = options.textures ? primitive.getAttribute("TEXCOORD_0") : null
      let uvs = texcoord ? new Float32Array(position.getCount() * 2) : null
      if (texcoord) {
        if (texcoord.getCount() !== position.getCount())
          throw new Error("UV count does not match positions")
        const uv: number[] = []
        for (let i = 0; i < position.getCount(); i++) {
          texcoord.getElement(i, uv)
          if (uv.length !== 2 || !uv.every(Number.isFinite))
            throw new Error("Invalid texture coordinates")
          uvs!.set(uv, i * 2)
        }
      }
      let vertices = new Float32Array(position.getCount() * 6)
      const sourceIndices = primitive.getIndices()
      let indices = new Uint32Array(sourceIndices?.getCount() ?? position.getCount())
      for (let i = 0; i < indices.length; i++) {
        const index = sourceIndices ? sourceIndices.getScalar(i) : i
        if (!Number.isInteger(index) || index < 0 || index >= position.getCount())
          throw new Error(`Invalid index in mesh ${meshId}`)
        indices[i] = index
      }
      if (indices.length % 3)
        throw new Error("Triangle index count must be a multiple of three")
      const v: number[] = []
      const n: number[] = []
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, v)
        if (!v.every(Number.isFinite)) throw new Error("Non-finite vertex position")
        vertices.set(v, i * 6)
        if (normal) {
          normal.getElement(i, n)
          vertices.set(n, i * 6 + 3)
        }
      }
      if (!normal) {
        // glTF's missing-normal fallback is flat shading: split corners per triangle.
        const flat = new Float32Array(indices.length * 6)
        for (let i = 0; i < indices.length; i += 3) {
          const a = indices[i] * 6,
            b = indices[i + 1] * 6,
            c = indices[i + 2] * 6
          const ux = vertices[b] - vertices[a],
            uy = vertices[b + 1] - vertices[a + 1],
            uz = vertices[b + 2] - vertices[a + 2]
          const vx = vertices[c] - vertices[a],
            vy = vertices[c + 1] - vertices[a + 1],
            vz = vertices[c + 2] - vertices[a + 2]
          const nx = uy * vz - uz * vy,
            ny = uz * vx - ux * vz,
            nz = ux * vy - uy * vx
          const length = Math.hypot(nx, ny, nz) || 1
          for (const [corner, source] of [a, b, c].entries())
            flat.set(
              [
                vertices[source],
                vertices[source + 1],
                vertices[source + 2],
                nx / length,
                ny / length,
                nz / length,
              ],
              (i + corner) * 6,
            )
        }
        if (uvs) {
          const original = uvs
          uvs = new Float32Array(indices.length * 2)
          indices.forEach((index, i) =>
            uvs!.set(original.subarray(index * 2, index * 2 + 2), i * 2),
          )
        }
        vertices = flat
        indices = Uint32Array.from({ length: indices.length }, (_, i) => i)
      }
      const verticesOffset = offset
      chunks.push(new Uint8Array(vertices.buffer))
      offset += vertices.byteLength
      const indicesOffset = offset
      chunks.push(new Uint8Array(indices.buffer))
      offset += indices.byteLength
      const uvOffset = uvs ? offset : undefined
      if (uvs) {
        chunks.push(new Uint8Array(uvs.buffer))
        offset += uvs.byteLength
      }
      geometry.push({
        ...(uvs ? { uvOffset } : {}),
        mesh: meshId,
        primitive: primitiveId,
        material: primitive.getMaterial()
          ? materialIds.get(primitive.getMaterial()!)!
          : null,
        verticesOffset,
        verticesCount: vertices.length,
        indicesOffset,
        indicesCount: indices.length,
      })
    }
  }
  const binary = Buffer.concat(chunks)
  const prepared: import("./prepared.js").PreparedModel = {
    version: 1,
    manifest,
    binary: "model.bin",
    binaryHash: createHash("sha256").update(binary).digest("hex"),
    geometry,
    ...(previewTextures.length ? { textures: previewTextures } : {}),
    limitations,
  }
  return { prepared, binary }
}
export async function generateInterface(input: string, output: string, url?: string) {
  if (extname(output) !== ".ts") throw new Error("Generated interface output must be .ts")
  const { basename } = await import("node:path")
  const { unlink, access } = await import("node:fs/promises")
  const { prepared, binary } = await prepareModel(input)
  const manifest = prepared.manifest
  const jsonPath = output.slice(0, -3) + ".model.json"
  const binPath = output.slice(0, -3) + ".model.bin"
  prepared.binary = basename(binPath)
  const keys = (items: { key: string }[]) =>
    items.map((item) => JSON.stringify(item.key)).join(" | ") || "never"
  const source = `// Generated model controls. Copy the sibling .model.json and .model.bin into your public assets.\nimport { loadModel, type LoadModelOptions } from 'shooosh-model/shooosh';\nimport type { ModelController } from 'shooosh-model';\nexport type NodeKey = ${keys(manifest.nodes)};\nexport const sourceHash = ${JSON.stringify(manifest.sourceHash)};\nexport type TypedModel = Omit<Awaited<ReturnType<typeof loadModel>>, 'nodes'> & { nodes: Record<NodeKey, ModelController['nodes'][string]> };\nexport async function load(canvas: HTMLCanvasElement, url: string = ${JSON.stringify(url ?? "")}, options: LoadModelOptions = {}): Promise<TypedModel> {\n  if (!url) throw new Error('Pass the URL of the prepared .model.json file');\n  return await loadModel(canvas, url, { ...options, sourceHash }) as TypedModel;\n}\n`
  const files: [string, string | Uint8Array][] = [
    [binPath, binary],
    [jsonPath, JSON.stringify(prepared, null, 2)],
    [output, source],
  ]
  for (const [path] of files) {
    try {
      await access(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }
    throw new Error(`Output exists: ${path}`)
  }
  const written: string[] = []
  try {
    for (const [path, data] of files) {
      await writeNew(path, data)
      written.push(path)
    }
  } catch (error) {
    await Promise.all(written.map((path) => unlink(path)))
    throw error
  }
  return { interface: output, metadata: jsonPath, binary: binPath }
}

export {
  convertModel,
  importFormats,
  type ConvertOptions,
  type ConversionReport,
} from "./convert.js"

export { optimizeTextures, type TextureOptions, type TextureReport } from "./textures.js"
export const optimizeModel = compressModel
export {
  inspectTexture,
  checkTexture,
  convertTexture,
  transcodeTexture,
  decodeTexture,
  textureToolsStatus,
  gpuTextureTargets,
  type TextureConvertOptions,
  type KtxOptions,
  type GpuTextureTarget,
} from "./texture-tools.js"
export {
  compareTextures,
  textureComparisons,
  type CompareOptions,
} from "./texture-compare.js"
export { serveTextureComparison } from "./texture-server.js"
export { checkModelTextures } from "./texture-compare.js"

export { prepareRig, generateRig } from "./rig-node.js"
