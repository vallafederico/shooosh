/** Bake the Sketchfab can into unit-space binaries + PBR maps for the landing page. */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"
import { bake } from "../../packages/model/dist/math.js"
import { createModelIO } from "../../packages/model/dist/node.js"

const here = dirname(fileURLToPath(import.meta.url))
const [glbArg, mapsArg, outArg] = process.argv.slice(2)
if (!glbArg || !mapsArg || !outArg) {
  throw new Error(
    "Usage: node web/scripts/prepare-can.mjs <can.glb> <texture-directory> <output-directory>",
  )
}

const glbPath = resolve(glbArg)
const maps = resolve(mapsArg)
const out = resolve(outArg)
await mkdir(out, { recursive: true })

const io = await createModelIO()
const doc = await io.read(glbPath)
const parts = []
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const world = node.getWorldMatrix()
  for (const primitive of mesh.listPrimitives()) {
    const pos = primitive.getAttribute("POSITION")
    const norm = primitive.getAttribute("NORMAL")
    const uv = primitive.getAttribute("TEXCOORD_0")
    const index = primitive.getIndices()
    if (!pos || !norm || !uv || !index) {
      throw new Error(`Missing POSITION/NORMAL/UV/indices on ${mesh.getName()}`)
    }
    const count = pos.getCount()
    const raw = new Float32Array(count * 6)
    const uvs = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      raw.set(pos.getElement(i, []), i * 6)
      raw.set(norm.getElement(i, []), i * 6 + 3)
      uvs.set(uv.getElement(i, []), i * 2)
    }
    parts.push({
      baked: bake(raw, world).vertices,
      uvs,
      indices: Uint32Array.from(index.getArray()),
    })
  }
}

const vertexCount = parts.reduce((n, part) => n + part.baked.length / 6, 0)
const indexCount = parts.reduce((n, part) => n + part.indices.length, 0)
const vertices = new Float32Array(vertexCount * 8)
const indices = new Uint32Array(indexCount)
let vertexOffset = 0
let indexOffset = 0
for (const part of parts) {
  const count = part.baked.length / 6
  for (let i = 0; i < count; i++) {
    vertices.set(part.baked.subarray(i * 6, i * 6 + 6), (vertexOffset + i) * 8)
    vertices.set(part.uvs.subarray(i * 2, i * 2 + 2), (vertexOffset + i) * 8 + 6)
  }
  for (let i = 0; i < part.indices.length; i++) indices[indexOffset + i] = part.indices[i] + vertexOffset
  vertexOffset += count
  indexOffset += part.indices.length
}

const min = [Infinity, Infinity, Infinity]
const max = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < vertices.length; i += 8) {
  for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], vertices[i + a])
    max[a] = Math.max(max[a], vertices[i + a])
  }
}
const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1
const center = min.map((n, i) => (n + max[i]) / 2)
for (let i = 0; i < vertices.length; i += 8) {
  for (let a = 0; a < 3; a++) vertices[i + a] = ((vertices[i + a] - center[a]) * 2) / extent
}

await writeFile(join(out, "vertices.bin"), Buffer.from(vertices.buffer))
await writeFile(join(out, "indices.bin"), Buffer.from(indices.buffer))

const size = 1024
const albedo = join(maps, "DefaultMaterial_Base_Color.png")
const metalPath = join(maps, "DefaultMaterial_Metallic.png")
const roughPath = join(maps, "DefaultMaterial_Roughness.png")
await sharp(albedo).resize(size, size, { fit: "cover" }).webp({ quality: 82 }).toFile(join(out, "albedo.webp"))

const metal = await sharp(metalPath).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const rough = await sharp(roughPath).resize(size, size).removeAlpha().raw().toBuffer({ resolveWithObject: true })
if (metal.info.width !== size || rough.info.width !== size) {
  throw new Error("Metallic/roughness resize did not produce 1024 maps")
}
const orm = Buffer.alloc(size * size * 3)
const metalChannels = metal.info.channels
const roughChannels = rough.info.channels
for (let i = 0; i < size * size; i++) {
  orm[i * 3] = 255
  orm[i * 3 + 1] = rough.data[i * roughChannels]
  orm[i * 3 + 2] = metal.data[i * metalChannels]
}
await sharp(orm, { raw: { width: size, height: size, channels: 3 } }).png().toFile(join(out, "orm.png"))

const manifest = {
  triangles: indices.length / 3,
  vertices: vertexCount,
  vertexStride: 8,
  maps: { albedo: "albedo.webp", orm: "orm.png" },
}
await writeFile(join(out, "model.json"), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      out,
      triangles: manifest.triangles,
      vertices: vertexCount,
      bytes: {
        vertices: vertices.byteLength,
        indices: indices.byteLength,
      },
      from: here,
    },
    null,
    2,
  ),
)
