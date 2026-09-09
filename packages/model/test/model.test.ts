import { test, expect } from "bun:test"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeFixture } from "./fixture"
import {
  inspectModel,
  checkModel,
  editModel,
  openModel,
  editDocument,
  compressModel,
  prepareModel,
  generateInterface,
  readMetadata,
} from "../src/node"
import { bindModel, inspectJson, type ModelAdapter } from "../src/runtime"
import { compose, bake, multiply, point, eulerQuaternion } from "../src/math"
async function fixture(fn: (dir: string, input: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "shooosh-model-"))
  try {
    const input = join(dir, "source.glb")
    await makeFixture(input)
    await fn(dir, input)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("metadata preserves hierarchy, duplicate names, shared meshes, animation targets and material IDs", async () =>
  fixture(async (_, input) => {
    const m = await inspectModel(input)
    expect(m.stats.nodes).toBe(5)
    expect(m.stats.meshes).toBe(1)
    expect(m.nodes.filter((n) => n.name === "Head").map((n) => n.key)).toEqual([
      "Head__3",
      "Head__4",
    ])
    expect(m.nodes[1].parent).toBe(0)
    expect(m.nodes[0].children).toEqual([1, 2, 3, 4])
    expect(m.animations[0].duration).toBe(1)
    expect(m.stats.uniqueMeshTriangles).toBe(12)
    expect((await checkModel(input)).issues.numErrors).toBe(0)
  }))
test("rejects malformed GLB headers, hierarchy cycles and duplicate parents", async () =>
  fixture(async (dir, input) => {
    const bytes = await readFile(input)
    bytes.writeUInt32LE(0xffffffff, 12)
    await writeFile(join(dir, "bad.glb"), bytes)
    await expect(readMetadata(join(dir, "bad.glb"))).rejects.toThrow("oversized")
    expect(() =>
      inspectJson({
        asset: { version: "2.0" },
        nodes: [{ children: [1] }, { children: [0] }],
      }),
    ).toThrow("Cycle")
    expect(() =>
      inspectJson({
        asset: { version: "2.0" },
        nodes: [{ children: [2] }, { children: [2] }, {}],
      }),
    ).toThrow("multiple parents")
  }))
test("per-node material edit does not recolor shared instances; source and existing outputs are preserved", async () =>
  fixture(async (dir, input) => {
    const before = await readFile(input)
    const output = join(dir, "edit.glb")
    await editModel(input, output, {
      nodes: [{ id: 1, translation: [3, 0, 0], material: { color: [1, 0, 0, 1] } }],
    })
    const { document } = await openModel(output)
    const nodes = document.getRoot().listNodes()
    expect(nodes[1].getTranslation()).toEqual([3, 0, 0])
    expect(nodes[1].getMesh()).not.toBe(nodes[2].getMesh())
    expect(
      nodes[1].getMesh()!.listPrimitives()[0].getMaterial()!.getBaseColorFactor(),
    ).toEqual([1, 0, 0, 1])
    expect(
      nodes[2].getMesh()!.listPrimitives()[0].getMaterial()!.getBaseColorFactor()[0],
    ).toBeCloseTo(0.14)
    expect(await readFile(input)).toEqual(before)
    await expect(editModel(input, output, {})).rejects.toThrow()
    expect((await checkModel(output)).issues.numErrors).toBe(0)
  }))
test("invalid patches are rejected before any mutations", async () =>
  fixture(async (_, input) => {
    const { document } = await openModel(input)
    const old = document.getRoot().listNodes()[1].getName()
    expect(() =>
      editDocument(document, {
        nodes: [
          { id: 1, name: "changed" },
          { id: 500, name: "bad" },
        ],
      }),
    ).toThrow("Unknown node")
    expect(document.getRoot().listNodes()[1].getName()).toBe(old)
    expect(() =>
      editDocument(document, { nodes: [{ id: 1, rotation: [1, 2, 3, 4] }] }),
    ).toThrow("unit quaternion")
  }))
test("meshopt preserves vertex values and oriented triangles, retaining identity and transforms", async () =>
  fixture(async (dir, input) => {
    const output = join(dir, "compressed.glb")
    await compressModel(input, output)
    expect((await readMetadata(output)).extensionsRequired).toContain(
      "EXT_meshopt_compression",
    )
    const a = await openModel(input),
      b = await openModel(output)
    expect(
      b.document
        .getRoot()
        .listNodes()
        .map((n) => [n.getName(), n.getTranslation()]),
    ).toEqual(
      a.document
        .getRoot()
        .listNodes()
        .map((n) => [n.getName(), n.getTranslation()]),
    )
    const indexAccessor = a.document
      .getRoot()
      .listMeshes()[0]
      .listPrimitives()[0]
      .getIndices()
    for (const [i, acc] of a.document.getRoot().listAccessors().entries()) {
      const actual = b.document.getRoot().listAccessors()[i].getArray()!
      if (acc !== indexAccessor) {
        expect(actual).toEqual(acc.getArray())
        continue
      }
      // The meshopt triangle codec may cyclically rotate each triangle, preserving winding.
      const expected = acc.getArray()!
      for (let k = 0; k < expected.length; k += 3) {
        const tri = Array.from(expected.slice(k, k + 3))
        const received = Array.from(actual.slice(k, k + 3))
        expect([tri, [tri[1], tri[2], tri[0]], [tri[2], tri[0], tri[1]]]).toContainEqual(
          received,
        )
      }
    }
    expect((await prepareModel(output)).prepared.geometry).toHaveLength(1)
  }))
test("generator emits typed controls and shared binary, refuses overwrite, prepared IDs match source", async () =>
  fixture(async (dir, input) => {
    const output = join(dir, "Product.ts")
    await generateInterface(input, output, "/models/Product.model.json")
    const source = await readFile(output, "utf8")
    expect(source).toContain("Head__3")
    expect(source).toContain("shooosh-model/shooosh")
    expect(source).not.toContain("three")
    const prepared = JSON.parse(await readFile(join(dir, "Product.model.json"), "utf8"))
    expect(prepared.geometry).toHaveLength(1)
    expect(prepared.manifest.sourceHash).toHaveLength(64)
    await expect(generateInterface(input, output)).rejects.toThrow("Output exists")
    expect(await readFile(output, "utf8")).toBe(source)
  }))
test("controller isolates descendants and ancestors, validates operations, and cleans event subscriptions", () => {
  const m = inspectJson({
    asset: { version: "2.0" },
    nodes: [
      { name: "root", children: [1, 2] },
      { name: "part", children: [3] },
      { name: "other" },
      { name: "leaf" },
    ],
  })
  const visible = new Map<number, boolean>()
  let events = 0,
    destroys = 0
  const adapter: ModelAdapter = {
    hasNode: () => true,
    transform() {},
    visible: (id, v) => {
      visible.set(id, v)
    },
    material() {},
    assignMaterial() {},
    play() {},
    stop() {},
    reset() {},
    destroy() {
      destroys++
    },
  }
  const model = bindModel(m, adapter)
  model.isolate("part__1")
  expect([...visible]).toEqual([
    [0, true],
    [1, true],
    [2, false],
    [3, true],
  ])
  const off = model.on("open", () => events++)
  model.trigger("open")
  off()
  model.trigger("open")
  expect(events).toBe(1)
  expect(() => model.nodes.part__1.setTransform({ scale: [NaN, 1, 1] })).toThrow(
    "Invalid",
  )
  model.destroy()
  model.destroy()
  expect(destroys).toBe(1)
  expect(() => model.trigger("open")).toThrow("destroyed")
})
test("hierarchy matrices and inverse-transpose normals handle nonuniform and mirrored scale", () => {
  const parent = compose([5, 0, 0], eulerQuaternion([0, 0, Math.PI / 2]), [2, 1, 1])
  const child = compose([1, 0, 0], [0, 0, 0, 1], [1, 1, 1])
  const p = point(multiply(parent, child), 0, 0, 0)
  expect(p[0]).toBeCloseTo(5)
  expect(p[1]).toBeCloseTo(2)
  const result = bake(
    new Float32Array([1, 0, 0, 1, 1, 0]),
    compose([0, 0, 0], [0, 0, 0, 1], [2, 1, 1]),
  )
  expect(result.vertices[3]).toBeCloseTo(1 / Math.sqrt(5))
  expect(result.vertices[4]).toBeCloseTo(2 / Math.sqrt(5))
  expect(
    bake(
      new Float32Array([1, 0, 0, 1, 0, 0]),
      compose([0, 0, 0], [0, 0, 0, 1], [-1, 1, 1]),
    ).mirrored,
  ).toBe(true)
})
