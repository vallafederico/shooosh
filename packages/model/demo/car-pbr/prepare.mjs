/** Standalone example preparation. Reads finished model variants; never edits engine or package source. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { resolve, join, dirname } from "node:path"
import { tmpdir } from "node:os"
import sharp from "sharp"
import { build } from "esbuild"
import { compileShader } from "shooosh/compiler"
import { bake } from "../../dist/math.js"
import { createModelIO, decodeTexture } from "../../dist/node.js"
import { fileURLToPath } from "node:url"
const here = dirname(fileURLToPath(import.meta.url))
const [inputArg, outputArg] = process.argv.slice(2)
if (!inputArg || !outputArg)
  throw new Error(
    "Usage: node prepare.mjs <car-variants-directory> <new-output-directory>",
  )
const input = resolve(inputArg),
  out = resolve(outputArg)
await mkdir(dirname(out), { recursive: true })
await mkdir(out)
const io = await createModelIO(),
  doc = await io.read(join(input, "original.glb"))
const mesh = doc.getRoot().listMeshes()[0],
  primitive = mesh.listPrimitives()[0]
const pos = primitive.getAttribute("POSITION"),
  norm = primitive.getAttribute("NORMAL"),
  uv = primitive.getAttribute("TEXCOORD_0"),
  index = primitive.getIndices()
if (!pos || !norm || !uv || !index || mesh.listPrimitives().length !== 1)
  throw new Error("Demo expects the car's single indexed primitive with normals and UVs")
const count = pos.getCount()
const raw = new Float32Array(count * 6)
for (let i = 0; i < count; i++) {
  raw.set(pos.getElement(i, []), i * 6)
  raw.set(norm.getElement(i, []), i * 6 + 3)
}
const world = doc
  .getRoot()
  .listNodes()
  .find((n) => n.getMesh() === mesh)
  .getWorldMatrix()
const transformed = bake(raw, world).vertices
const position = (i) => Array.from(transformed.slice(i * 6, i * 6 + 3))
const normal = (i) => Array.from(transformed.slice(i * 6 + 3, i * 6 + 6))
const vertices = new Float32Array(count * 8),
  indices = new Uint32Array(index.getArray())
let min = [Infinity, Infinity, Infinity],
  max = [-Infinity, -Infinity, -Infinity]
for (let i = 0; i < count; i++) {
  const p = position(i)
  p.forEach((n, a) => {
    min[a] = Math.min(min[a], n)
    max[a] = Math.max(max[a], n)
  })
}
const extent = Math.max(...max.map((n, i) => n - min[i])),
  center = min.map((n, i) => (n + max[i]) / 2)
for (let i = 0; i < count; i++) {
  vertices.set(
    position(i).map((n, a) => ((n - center[a]) * 2) / extent),
    i * 8,
  )
  vertices.set(normal(i), i * 8 + 3)
  vertices.set(uv.getElement(i, []), i * 8 + 6)
}
await writeFile(join(out, "vertices.bin"), new Uint8Array(vertices.buffer))
await writeFile(join(out, "indices.bin"), new Uint8Array(indices.buffer))
const size = 1024
const normalize = (v) => {
  const l = Math.hypot(...v) || 1
  return v.map((n) => n / l)
}
const dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0)
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
// Bake tangent-space detail for this static reference mesh. Conflicting mirrored/overlapping UVs use geometric normals.
function bakeNormals(normalPixels) {
  const pixels = Buffer.alloc(size * size * 4),
    covered = new Uint8Array(size * size),
    conflict = new Uint8Array(size * size)
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 128
    pixels[i + 1] = 128
    pixels[i + 2] = 255
    pixels[i + 3] = 255
  }
  for (let tri = 0; tri < indices.length; tri += 3) {
    const ids = [indices[tri], indices[tri + 1], indices[tri + 2]],
      p = ids.map((id) => Array.from(vertices.slice(id * 8, id * 8 + 3))),
      n = ids.map((id) => Array.from(vertices.slice(id * 8 + 3, id * 8 + 6))),
      t = ids.map((id) => Array.from(vertices.slice(id * 8 + 6, id * 8 + 8)))
    const d1 = t[1].map((v, i) => v - t[0][i]),
      d2 = t[2].map((v, i) => v - t[0][i]),
      det = d1[0] * d2[1] - d1[1] * d2[0]
    if (Math.abs(det) < 1e-10) continue
    const e1 = p[1].map((v, i) => v - p[0][i]),
      e2 = p[2].map((v, i) => v - p[0][i])
    const tan = e1.map((v, i) => (v * d2[1] - e2[i] * d1[1]) / det),
      bit = e1.map((v, i) => (e2[i] * d1[0] - v * d2[0]) / det)
    const x0 = Math.max(0, Math.floor(Math.min(...t.map((v) => v[0])) * size)),
      x1 = Math.min(size - 1, Math.ceil(Math.max(...t.map((v) => v[0])) * size))
    const y0 = Math.max(0, Math.floor(Math.min(...t.map((v) => v[1])) * size)),
      y1 = Math.min(size - 1, Math.ceil(Math.max(...t.map((v) => v[1])) * size))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const du = (x + 0.5) / size - t[0][0],
          dv = (y + 0.5) / size - t[0][1],
          b = (du * d2[1] - dv * d2[0]) / det,
          c = (d1[0] * dv - d1[1] * du) / det,
          a = 1 - b - c
        if (a < 0 || b < 0 || c < 0) continue
        const N = normalize(n[0].map((v, i) => v * a + n[1][i] * b + n[2][i] * c)),
          T = normalize(tan.map((v, i) => v - N[i] * dot(N, tan))),
          B = cross(N, T).map((v) => v * (dot(cross(N, T), bit) < 0 ? -1 : 1))
        const k = y * size + x,
          j = k * 4,
          m = [
            normalPixels[j] / 127.5 - 1,
            normalPixels[j + 1] / 127.5 - 1,
            normalPixels[j + 2] / 127.5 - 1,
          ]
        const baked = normalize(N.map((v, i) => T[i] * m[0] + B[i] * m[1] + v * m[2]))
        if (
          covered[k] &&
          dot(baked, [
            pixels[j] / 127.5 - 1,
            pixels[j + 1] / 127.5 - 1,
            pixels[j + 2] / 127.5 - 1,
          ]) < 0.7
        )
          conflict[k] = 1
        covered[k] = 1
        baked.forEach((v, i) => (pixels[j + i] = Math.round((v * 0.5 + 0.5) * 255)))
      }
  }
  // Alpha masks ambiguous UV texels so the shader falls back to interpolated geometric normals.
  let conflicts = 0
  for (let k = 0; k < covered.length; k++)
    if (!covered[k] || conflict[k]) {
      pixels[k * 4 + 3] = 0
      if (conflict[k]) conflicts++
    }
  return { pixels, conflicts }
}
const variants = []
const temporary = await mkdtemp(join(tmpdir(), "car-pbr-"))
try {
  for (const name of ["original", "webp", "ktx2"]) {
    const modelPath = join(input, name + ".glb"),
      model = await io.read(modelPath),
      mat = model.getRoot().listMaterials()[0]
    const textures = [
      mat.getBaseColorTexture(),
      mat.getNormalTexture(),
      mat.getMetallicRoughnessTexture(),
      mat.getEmissiveTexture(),
    ]
    const rgba = []
    let sourceBytes = 0
    for (const [id, texture] of textures.entries()) {
      if (!texture?.getImage()) throw new Error(`Missing texture slot ${id}`)
      sourceBytes += texture.getImage().length
      const path = join(temporary, `${id}.${texture.getMimeType().split("/")[1]}`)
      await writeFile(path, texture.getImage())
      rgba.push(
        await sharp(await decodeTexture(path))
          .resize(size, size, { fit: "fill" })
          .ensureAlpha()
          .raw()
          .toBuffer(),
      )
    }
    const baked = bakeNormals(rgba[1])
    rgba[1] = baked.pixels
    const atlas = await sharp({
      create: {
        width: size * 2,
        height: size * 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        rgba.map((input, i) => ({
          input,
          raw: { width: size, height: size, channels: 4 },
          left: (i % 2) * size,
          top: Math.floor(i / 2) * size,
        })),
      )
      .png()
      .toBuffer()
    await writeFile(join(out, name + ".png"), atlas)
    variants.push({
      name,
      sourceBytes,
      previewBytes: atlas.length,
      normalConflicts: baked.conflicts,
    })
  }
} finally {
  await rm(temporary, { recursive: true, force: true })
}
const source = await readFile(join(here, "material.wgsl"), "utf8")
const shader = compileShader(source, { includeNormal: true })
await writeFile(join(out, "shader.json"), JSON.stringify(shader))
await writeFile(
  join(out, "model.json"),
  JSON.stringify({
    vertexCount: count,
    indexCount: indices.length,
    triangles: indices.length / 3,
    variants,
    credit: { name: "cuadot", url: "https://sketchfab.com/cuadot" },
  }),
)
await build({
  entryPoints: [join(here, "viewer.ts")],
  bundle: true,
  alias: { shooosh: resolve(here, "../../../../package/index.ts") },
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: join(out, "viewer.js"),
  metafile: true,
  logLevel: "silent",
}).then((result) => {
  if (
    Object.keys(result.metafile.inputs).some((path) =>
      /sharp|gltf-transform|texture2ddecoder|assimp/.test(path),
    )
  )
    throw new Error("Node processing leaked into example")
})
for (const name of ["index.html", "style.css"])
  await writeFile(join(out, name), await readFile(join(here, name)))
console.log(JSON.stringify({ output: out, variants }, null, 2))
