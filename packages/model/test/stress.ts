/** Reproducible local stress asset; no network downloads. */
import { Document, NodeIO } from "@gltf-transform/core"
const size = 256,
  doc = new Document(),
  buffer = doc.createBuffer()
const vertices = new Float32Array(size * size * 3)
const indices = new Uint32Array((size - 1) * (size - 1) * 6)
for (let z = 0; z < size; z++)
  for (let x = 0; x < size; x++) {
    const k = (z * size + x) * 3
    vertices.set(
      [
        (x / size) * 4 - 2,
        Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.2,
        (z / size) * 4 - 2,
      ],
      k,
    )
  }
let k = 0
for (let z = 0; z < size - 1; z++)
  for (let x = 0; x < size - 1; x++) {
    const a = z * size + x
    indices.set([a, a + size, a + 1, a + 1, a + size, a + size + 1], k)
    k += 6
  }
const primitive = doc
  .createPrimitive()
  .setAttribute(
    "POSITION",
    doc.createAccessor().setType("VEC3").setArray(vertices).setBuffer(buffer),
  )
  .setIndices(doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer))
  .setMaterial(
    doc
      .createMaterial("Terrain")
      .setBaseColorFactor([0.15, 0.5, 0.3, 1])
      .setMetallicFactor(0),
  )
const mesh = doc.createMesh("Terrain").addPrimitive(primitive)
const scene = doc.createScene("Stress")
for (let i = 0; i < 4; i++)
  scene.addChild(
    doc
      .createNode(`Tile ${i}`)
      .setMesh(mesh)
      .setTranslation([(i % 2) * 4, 0, Math.floor(i / 2) * 4]),
  )
doc.getRoot().setDefaultScene(scene)
await new NodeIO().write(process.argv[2] ?? "/tmp/shooosh-model-stress.glb", doc)
