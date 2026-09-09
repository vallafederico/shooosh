import { test, expect } from "bun:test"
import { createRig, createRigAnimator, writeSkinMatrices, getSocketMatrix } from "./index"
import type { RigDefinition } from "./index"
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const translate = (x: number, y = 0, z = 0) => [...I.slice(0, 12), x, y, z, 1]
function definition(): RigDefinition {
  return {
    version: 1,
    nodes: [
      { name: "Parent", translation: [10, 0, 0] },
      { key: "hip", name: "Bone", parent: 0, translation: [0, 2, 0] },
      { key: "hand", name: "Bone", parent: 1, translation: [0, 3, 0] },
      { name: "Mesh", translation: [10, 0, 0] },
    ],
    skins: [
      {
        key: "body",
        joints: [2, 1],
        inverseBindMatrices: [...translate(0, -5), ...translate(0, -2)],
      },
    ],
  }
}
test("stable joint references, ambiguous names, non-joint ancestry and isolated input/output data", () => {
  const data = definition(),
    rig = createRig(data)
  expect(() => rig.bone("Bone")).toThrow("Ambiguous")
  expect(() => rig.bone("Parent")).toThrow("not a joint")
  expect(rig.findBones("Bone").map((b) => b.key)).toEqual(["hip", "hand"])
  expect(rig.bone("hand")).toBe(rig.bone(2))
  expect(Array.from(rig.bone("hand").worldMatrix()).slice(12, 15)).toEqual([10, 5, 0])
  ;(data.nodes[0].translation as number[])[0] = 99
  const output = rig.bone("hand").worldMatrix()
  output[12] = 99
  expect(rig.bone("hand").worldMatrix()[12]).toBe(10)
  rig.node(0).setLocal({ translation: [20, 0, 0] })
  expect(rig.bone(2).worldMatrix()[12]).toBe(20)
  rig.reset()
  expect(rig.bone(2).worldMatrix()[12]).toBe(10)
})
test("mesh-local palettes preserve joint order, inverse bind and reusable outputs; sockets track rotations", () => {
  const rig = createRig(definition())
  const out = new Float32Array(32)
  expect(writeSkinMatrices(rig, "body", 3, out)).toBe(out)
  expect(Array.from(out)).toEqual([...I, ...I])
  rig.bone("hand").setLocal({ translation: [1, 3, 0] })
  expect(Array.from(writeSkinMatrices(rig, "body", 3)).slice(12, 15)).toEqual([1, 0, 0])
  expect(Array.from(writeSkinMatrices(rig, "body", 3)).slice(28, 31)).toEqual([0, 0, 0])
  rig.bone("hip").setLocal({ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] })
  const socket = getSocketMatrix(rig, "hand", translate(1))
  expect(socket[12]).toBeCloseTo(7)
  expect(socket[13]).toBeCloseTo(4)
  rig.node(3).setLocal({ scale: [0, 1, 1] })
  out.fill(42)
  expect(() => writeSkinMatrices(rig, "body", 3, out)).toThrow("Singular")
  expect(out.every((v) => v === 42)).toBe(true)
})
test("hierarchy and skin validation handles deep chains, cycles, duplicate keys, invalid binds and static matrices", () => {
  const rig = createRig({
    version: 1,
    nodes: Array.from({ length: 20000 }, (_, i) => ({
      parent: i ? i - 1 : null,
      translation: [1, 0, 0],
    })),
  })
  expect(rig.bone(19999).worldMatrix()[12]).toBe(20000)
  for (const nodes of [
    [{ parent: 1 }, { parent: 0 }],
    [{ parent: 4 }],
    [{ key: "x" }, { key: "x" }],
  ])
    expect(() => createRig({ version: 1, nodes })).toThrow()
  expect(() =>
    createRig({ version: 1, nodes: [{}], skins: [{ joints: [0, 0] }] }),
  ).toThrow()
  expect(() =>
    createRig({
      version: 1,
      nodes: [{}],
      skins: [{ joints: [0], inverseBindMatrices: [1] }],
    }),
  ).toThrow()
  expect(() =>
    createRig({ version: 1, nodes: [{}, {}], skins: [{ joints: [1], skeleton: 0 }] }),
  ).toThrow("ancestor")
  const staticRig = createRig({
    version: 1,
    nodes: [{ matrix: translate(5) }, { parent: 0 }],
  })
  expect(staticRig.bone(1).worldMatrix()[12]).toBe(5)
  expect(() => staticRig.bone(0).setLocal({ translation: [2, 0, 0] })).toThrow(
    "static matrix",
  )
})
test("pose patches are atomic, absolute, normalized and resettable", () => {
  const rig = createRig(definition())
  expect(() =>
    rig.setPose(
      [
        { node: 1, transform: { translation: [4, 5, 6] } },
        { node: 2, transform: { rotation: [0, 0, 0, 0] } },
      ],
      { reset: true },
    ),
  ).toThrow()
  expect(rig.bone(1).getLocal().translation).toEqual([0, 2, 0])
  expect(() => rig.bone(1).setLocal({ scale: [1, NaN, 1] })).toThrow()
  rig.bone(1).setLocal({ rotation: [0, 0, 2, 2] })
  expect(Math.hypot(...rig.bone(1).getLocal().rotation)).toBeCloseTo(1)
  const pose = rig.getPose()
  rig.reset()
  rig.setPose(pose)
  expect(rig.bone(1).getLocal().rotation[2]).toBeCloseTo(Math.SQRT1_2)
})
test("STEP/LINEAR clips clamp and loop, reset untargeted properties and slerp shortest quaternion arc", () => {
  const rig = createRig({ version: 1, nodes: [{}] })
  const player = createRigAnimator(rig, [
    {
      name: "move",
      tracks: [
        { node: 0, path: "translation", times: [1, 3], values: [0, 0, 0, 10, 0, 0] },
        {
          node: 0,
          path: "rotation",
          times: [1, 3],
          values: [0, 0, 0, 1, 0, 0, -Math.SQRT1_2, -Math.SQRT1_2],
        },
      ],
    },
    {
      key: "step",
      tracks: [
        {
          node: 0,
          path: "translation",
          interpolation: "STEP",
          times: [0, 1, 2],
          values: [0, 0, 0, 4, 0, 0, 8, 0, 0],
        },
      ],
    },
  ])
  player.sample("move", 2)
  expect(rig.bone(0).getLocal().translation[0]).toBe(5)
  expect(rig.bone(0).getLocal().rotation[2]).toBeCloseTo(Math.sin(Math.PI / 8))
  player.sample("move", 100)
  expect(rig.bone(0).getLocal().translation[0]).toBe(10)
  player.sample("move", -10)
  expect(rig.bone(0).getLocal().translation[0]).toBe(0)
  player.sample("step", 1)
  expect(rig.bone(0).getLocal().translation[0]).toBe(4)
  expect(rig.bone(0).getLocal().rotation).toEqual([0, 0, 0, 1])
  player.sample("step", -0.5, { loop: true })
  expect(rig.bone(0).getLocal().translation[0]).toBe(4)
  player.sample("step", 2, { loop: true })
  expect(rig.bone(0).getLocal().translation[0]).toBe(0)
})
test("CUBICSPLINE scales tangents by key interval and normalizes rotations", () => {
  const rig = createRig({ version: 1, nodes: [{}] })
  const player = createRigAnimator(rig, [
    {
      tracks: [
        {
          node: 0,
          path: "translation",
          interpolation: "CUBICSPLINE",
          times: [0, 2],
          values: [0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        },
        {
          node: 0,
          path: "rotation",
          interpolation: "CUBICSPLINE",
          times: [0, 2],
          values: [
            0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
          ],
        },
      ],
    },
  ])
  player.sample(0, 1)
  expect(rig.bone(0).getLocal().translation[0]).toBeCloseTo(0.5)
  expect(rig.bone(0).getLocal().rotation[2]).toBeCloseTo(Math.SQRT1_2)
})
test("invalid animation channels fail early and interpolation failure preserves the pose", () => {
  const rig = createRig({ version: 1, nodes: [{}] })
  const track = {
    node: 0,
    path: "translation" as const,
    times: [0, 1],
    values: [0, 0, 0, 1, 0, 0],
  }
  for (const bad of [
    { ...track, times: [1, 1] },
    { ...track, values: [1] },
    { ...track, node: 3 },
    { ...track, times: [0, Infinity] },
  ])
    expect(() => createRigAnimator(rig, [{ tracks: [bad] }])).toThrow()
  expect(() => createRigAnimator(rig, [{ tracks: [track, track] }])).toThrow("Duplicate")
  const player = createRigAnimator(rig, [
    {
      tracks: [
        {
          node: 0,
          path: "rotation",
          times: [0, 1],
          interpolation: "CUBICSPLINE",
          values: [
            0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0,
          ],
        },
      ],
    },
  ])
  expect(() => player.sample(0, 0.5)).toThrow("Zero quaternion")
  expect(rig.bone(0).getLocal().rotation).toEqual([0, 0, 0, 1])
  expect(() => player.sample(0, NaN)).toThrow()
})

test("palettes invert rotated, reflected and tiny-scale mesh transforms", () => {
  for (const scale of [
    [-2, 3, 0.4],
    [0.00001, 0.00001, 0.00001],
  ]) {
    const rig = createRig({
      version: 1,
      nodes: [{ translation: [4, -2, 7], rotation: [0.2, 0.3, -0.4, 0.5], scale }],
      skins: [{ joints: [0] }],
    })
    const palette = writeSkinMatrices(rig, 0, 0)
    Array.from(palette).forEach((value, i) => expect(value).toBeCloseTo(I[i], 5))
    rig.node(0).setLocal({ translation: undefined })
    expect(rig.node(0).getLocal().translation).toEqual([4, -2, 7])
  }
})
