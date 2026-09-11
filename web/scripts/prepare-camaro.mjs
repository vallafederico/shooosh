/** Reconstruct the supplied Camaro FBX, validate, then bake static multi-material geometry. */
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { convertModel, createModelIO, checkModel, inspectModel, compressModel, checkTexture } from '../../packages/model/dist/node.js'
import { bake } from '../../packages/model/dist/math.js'
const [sourceArg, outArg] = process.argv.slice(2)
if (!sourceArg || !outArg) throw new Error('Usage: node web/scripts/prepare-camaro.mjs <download-directory> <new-output-directory>')
const source = resolve(sourceArg), out = resolve(outArg)
await mkdir(out) // never overwrite a prepared asset
const work = await mkdtemp(join(tmpdir(), 'shooosh-camaro-'))
const aliases = {
  Material__50: 'car_bottom.png', Material__45: 'Chevrolet_Camaro_SS_2010_RM_Rim_new.png',
  Material__456: 'Chevrolet_Camaro_SS_2010_RM_Rim_new.png', Rim_Blur: 'Chevrolet_Camaro_SS_2010_RM_Rim_new.png',
  Material__450: 'Car_Windows.png', Material__454: 'Car_Windows.png', Material__451: 'Car_Windows.png', Material__453: 'Car_Windows.png',
}
// Same Assimp importer as the model workflow. Repair broken image references in
// the intermediate glTF before validation: the FBX uses extensionless material names.
const assimp = await createRequire(new URL('../../packages/model/package.json', import.meta.url))('assimpjs')()
const fbx = await readFile(join(source, 'source/camaross1/camaross1.fbx'))
const result = assimp.ConvertFile('camaross1.fbx', 'gltf2', fbx, () => false, () => new Uint8Array())
if (!result.IsSuccess()) throw new Error(result.GetErrorCode())
let json
for (let i = 0; i < result.FileCount(); i++) {
  const file = result.GetFile(i), bytes = Buffer.from(file.GetContent())
  if (file.GetPath().endsWith('.gltf')) json = JSON.parse(bytes)
  else await writeFile(join(work, file.GetPath()), bytes)
}
for (const image of json.images) {
  if (image.uri.startsWith('data:')) continue
  const alias = image.uri.split(/[\\/]/).pop()
  if (!aliases[alias]) throw new Error(`Unmapped source texture: ${image.uri}`)
  image.uri = `data:image/png;base64,${(await readFile(join(source, 'textures', aliases[alias]))).toString('base64')}`
  image.mimeType = 'image/png'
  image.name = aliases[alias]
}
// Assimp emits polygon-source metadata on already triangulated primitives.
for (const mesh of json.meshes) for (const p of mesh.primitives) {
  if (p.mode !== undefined && p.mode !== 4) throw new Error('Expected triangulated geometry')
  if (p.extensions) { delete p.extensions.FB_ngon_encoding; if (!Object.keys(p.extensions).length) delete p.extensions }
}
json.extensionsUsed = (json.extensionsUsed ?? []).filter(name => name !== 'FB_ngon_encoding')
if (!json.extensionsUsed.length) delete json.extensionsUsed
await writeFile(join(work, 'reconstructed.gltf'), JSON.stringify(json))
const io = await createModelIO(), repair = await io.read(join(work, 'reconstructed.gltf'))
let repairedNormals = 0, degenerateTriangles = 0
for (const mesh of repair.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const pos = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), indices = primitive.getIndices()
  const sums = new Float64Array(pos.getCount() * 3), kept = []
  const index = indices.getArray()
  for (let i = 0; i < index.length; i += 3) {
    const a = pos.getElement(index[i], []), b = pos.getElement(index[i + 1], []), c = pos.getElement(index[i + 2], [])
    const u = b.map((v, j) => v - a[j]), v = c.map((v, j) => v - a[j])
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
    if (Math.hypot(...n) < 1e-12) { degenerateTriangles++; continue }
    kept.push(index[i], index[i+1], index[i+2])
    for (const id of [index[i], index[i+1], index[i+2]]) for (let j = 0; j < 3; j++) sums[id*3+j] += n[j]
  }
  indices.setArray(Uint32Array.from(kept))
  for (let i = 0; i < normal.getCount(); i++) {
    let n = normal.getElement(i, []), length = Math.hypot(...n)
    if (length < 1e-8) { n = Array.from(sums.subarray(i*3, i*3+3)); length = Math.hypot(...n); repairedNormals++ }
    normal.setElement(i, length > 0 ? n.map(v => v / length) : [0, 1, 0])
  }
}
const repaired = join(work, 'repaired.glb')
await io.write(repaired, repair)
const imported = join(work, 'reconstructed.glb')
await convertModel(repaired, imported, { textures: false })
const doc = await io.read(imported)
const removed = []
for (const node of doc.getRoot().listNodes()) {
  if (/Rim_Blur/i.test(node.getName())) { removed.push(node.getName()); node.setMesh(null) }
}
const staticPath = join(work, 'static.glb')
await io.write(staticPath, doc)
const optimized = join(work, 'optimized.glb')
const compression = await compressModel(staticPath, optimized, { textures: { maxSize: 1024, format: 'webp', quality: 88 } })
const checks = await Promise.all([checkModel(imported), checkModel(optimized)])
if (checks.some(c => c.issues.numErrors)) throw new Error('Model validation failed')
const inventory = await inspectModel(optimized)
const groups = new Map(), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
// Bake the source hierarchy, retaining each material's original UVs. No single
// image atlas: repeat UVs on wheels must not bleed into other materials.
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), norm = p.getAttribute('NORMAL'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices(), mat = p.getMaterial()
    if (!pos || !norm || !uv || !idx || !mat) throw new Error(`Incomplete geometry: ${node.getName()}`)
    const tex = mat.getBaseColorTexture(); if (!tex) throw new Error(`Missing texture: ${mat.getName()}`)
    const bytes = tex.getImage(), key = createHash('sha256').update(bytes).digest('hex')
    let group = groups.get(key)
    if (!group) { group = { parts: [], names: [], bytes, name: tex.getName(), factor: mat.getBaseColorFactor() }; groups.set(key, group) }
    group.names.push(node.getName())
    const raw = new Float32Array(pos.getCount() * 6)
    for (let i = 0; i < pos.getCount(); i++) { raw.set(pos.getElement(i, []), i * 6); raw.set(norm.getElement(i, []), i * 6 + 3) }
    const transformed = bake(raw, node.getWorldMatrix()).vertices
    const vertices = new Float32Array(pos.getCount() * 8)
    for (let i = 0; i < pos.getCount(); i++) {
      vertices.set(transformed.subarray(i * 6, i * 6 + 6), i * 8); vertices.set(uv.getElement(i, []), i * 8 + 6)
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], vertices[i * 8 + a]); max[a] = Math.max(max[a], vertices[i * 8 + a]) }
    }
    group.parts.push({ vertices, indices: Uint32Array.from(idx.getArray()) })
  }
}
const extent = Math.max(...max.map((v, i) => v - min[i])), center = min.map((v, i) => (v + max[i]) / 2)
const parts = []; let radius = 0, triangles = 0
for (const [id, group] of [...groups.values()].entries()) {
  const vertices = new Float32Array(group.parts.reduce((n, p) => n + p.vertices.length, 0))
  const indices = new Uint32Array(group.parts.reduce((n, p) => n + p.indices.length, 0))
  let vo = 0, io = 0
  for (const part of group.parts) {
    vertices.set(part.vertices, vo * 8)
    for (const index of part.indices) indices[io++] = index + vo
    vo += part.vertices.length / 8
  }
  for (let i = 0; i < vertices.length; i += 8) {
    for (let a = 0; a < 3; a++) vertices[i + a] = (vertices[i + a] - center[a]) * 2 / extent
    radius = Math.max(radius, Math.hypot(vertices[i], vertices[i + 1], vertices[i + 2]))
  }
  triangles += indices.length / 3
  const rim = /Rim/i.test(group.name), tire = /Tires|bottom|interior/i.test(group.name), glass = /Windows/i.test(group.name)
  // The source is diffuse/Phong. These are explicitly studio PBR approximations.
  const roughness = tire ? 0.85 : glass ? 0.15 : rim ? 0.25 : 0.35
  const metallic = tire ? 0 : glass ? 0.1 : rim ? 0.75 : 0.3
  await writeFile(join(out, `${id}.vertices.bin`), Buffer.from(vertices.buffer))
  await writeFile(join(out, `${id}.indices.bin`), Buffer.from(indices.buffer))
  await sharp(bytesOf(group)).removeAlpha().linear(group.factor[0], 0).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toFile(join(out, `${id}.webp`))
  await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 255, g: Math.round(roughness * 255), b: Math.round(metallic * 255) } } }).png().toFile(join(out, `${id}.orm.png`))
  const material = { kind: group.names.every(name => /window/i.test(name)) ? 'glass' : group.names.some(name => /hood_hires/i.test(name)) ? 'paint' : 'standard', clearcoat: group.names.some(name => /hood_hires/i.test(name)) ? 0.65 : 0, clearcoatRoughness: 0.2 }
  parts.push({ id, material, names: group.names, texture: `${id}.webp`, orm: `${id}.orm.png`, vertices: `${id}.vertices.bin`, indices: `${id}.indices.bin` })
}
function bytesOf(group) { return Buffer.from(group.bytes) }
const report = { source: 'User-supplied Chevrolet Camaro SS race car FBX; author/license metadata not present in download.', sourceHash: createHash('sha256').update(fbx).digest('hex'), textureReconstruction: aliases, repairedNormals, degenerateTriangles, omittedImporterMetadata: 'FB_ngon_encoding', removedWheelBlurNodes: removed, sourceBounds: { min, max }, triangles, draws: parts.length, validation: checks.map(c => c.issues), compression, limitations: ['Static rigid model; no wheel animation.', 'Diffuse textures with approximate studio PBR; glass rendered as opaque tinted surfaces.'], work }
for (const part of parts) for (const image of [part.texture, part.orm]) {
  const check = await checkTexture(join(out, image))
  if (!check.valid) throw new Error(`Texture verification failed: ${image}`)
}
const { work: temporaryDirectory, ...portableReport } = report
await writeFile(join(out, 'preparation-report.json'), JSON.stringify(portableReport, null, 2))
await writeFile(join(out, 'model.json'), JSON.stringify({ radius, parts }, null, 2))
await writeFile(join(work, 'inventory.json'), JSON.stringify(inventory, null, 2))
await writeFile(join(work, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
