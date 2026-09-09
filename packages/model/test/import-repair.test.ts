import { test, expect } from "bun:test"
import { Document } from "@gltf-transform/core"
import { normalizeImportedTransforms } from "../src/import-repair"
import { attributionHtml } from "../src/attribution"
test("import normalization repairs rotations and weights without dropping the rig", () => {
  const d = new Document(),
    buffer = d.createBuffer(),
    node = d.createNode()
  const values = d
    .createAccessor()
    .setType("VEC4")
    .setArray(new Float32Array([0, 0, 0, 0.5]))
    .setBuffer(buffer)
  const time = d
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Float32Array([0]))
    .setBuffer(buffer)
  const sampler = d.createAnimationSampler().setInput(time).setOutput(values)
  d.createAnimation()
    .addSampler(sampler)
    .addChannel(
      d
        .createAnimationChannel()
        .setSampler(sampler)
        .setTargetNode(node)
        .setTargetPath("rotation"),
    )
  const weights = d
    .createAccessor()
    .setType("VEC4")
    .setArray(new Float32Array([0.2, 0.2, 0, 0]))
    .setBuffer(buffer)
  const primitive = d.createPrimitive().setAttribute("WEIGHTS_0", weights)
  node.setMesh(d.createMesh().addPrimitive(primitive))
  expect(normalizeImportedTransforms(d)).toEqual({ rotations: 1, weights: 1 })
  expect(values.getElement(0, [])).toEqual([0, 0, 0, 1])
  expect(weights.getElement(0, [])).toEqual([0.5, 0.5, 0, 0])
  expect(d.getRoot().listAnimations()).toHaveLength(1)
  expect(normalizeImportedTransforms(d)).toEqual({ rotations: 0, weights: 0 })
})
test("attribution escapes text and restricts links", () => {
  expect(
    attributionHtml("<!-- attribution -->", {
      name: "<name>",
      url: "https://sketchfab.com/cuadot",
    }),
  ).toContain("&lt;name&gt;")
  expect(() =>
    attributionHtml("<!-- attribution -->", { name: "x", url: "javascript:alert(1)" }),
  ).toThrow()
})
