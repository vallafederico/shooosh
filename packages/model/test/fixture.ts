import { Document, NodeIO } from "@gltf-transform/core"
/** Small authored fixture, no downloaded assets. Shared cube geometry/material. */
export async function makeFixture(path: string) {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const positions = new Float32Array([
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
  ])
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6,
    7, 4, 5, 1, 4, 1, 0,
  ])
  const material = doc
    .createMaterial("Enamel")
    .setBaseColorFactor([0.14, 0.46, 0.65, 1])
    .setMetallicFactor(0.15)
    .setRoughnessFactor(0.4)
  const primitive = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer),
    )
    .setIndices(
      doc.createAccessor().setType("SCALAR").setArray(indices).setBuffer(buffer),
    )
    .setMaterial(material)
  const mesh = doc.createMesh("Cube").addPrimitive(primitive)
  const root = doc.createNode("Assembly")
  const base = doc
    .createNode("Base")
    .setMesh(mesh)
    .setTranslation([0, -1.3, 0])
    .setScale([1.4, 0.2, 1])
  const arm = doc
    .createNode("Arm")
    .setMesh(mesh)
    .setTranslation([0, -0.25, 0])
    .setScale([0.3, 0.8, 0.3])
  const head = doc
    .createNode("Head")
    .setMesh(mesh)
    .setTranslation([0, 1, 0])
    .setScale([0.8, 0.45, 0.5])
  const lens = doc
    .createNode("Head")
    .setMesh(mesh)
    .setTranslation([0.5, 1, 0.55])
    .setScale([0.15, 0.15, 0.15])
  root.addChild(base).addChild(arm).addChild(head).addChild(lens)
  doc.createScene("Product").addChild(root)
  doc.getRoot().setDefaultScene(doc.getRoot().listScenes()[0])
  const time = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Float32Array([0, 1]))
    .setBuffer(buffer)
  const out = doc
    .createAccessor()
    .setType("VEC3")
    .setArray(new Float32Array([0, -0.25, 0, 0, 0.25, 0]))
    .setBuffer(buffer)
  const sampler = doc
    .createAnimationSampler()
    .setInput(time)
    .setOutput(out)
    .setInterpolation("LINEAR")
  doc
    .createAnimation("Lift")
    .addSampler(sampler)
    .addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(arm)
        .setTargetPath("translation")
        .setSampler(sampler),
    )
  await new NodeIO().write(path, doc)
  return doc
}
if (import.meta.main) await makeFixture(process.argv[2] ?? "/tmp/shooosh-model-demo.glb")
