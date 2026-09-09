import { test, expect } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import { makeFixture } from "./fixture"
import { createModelIO, prepareRig, generateRig } from "../dist/node.js"
import { createRig, createRigAnimator, writeSkinMatrices } from "../../../package/rig"

test("CLI rig extraction preserves bone IDs, bind order and animation samples without rewriting source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-rig-test-"))
  try {
    const input = join(dir, "rigged.glb"),
      output = join(dir, "product.rig.json")
    const doc = await makeFixture(input),
      nodes = doc.getRoot().listNodes(),
      buffer = doc.getRoot().listBuffers()[0]
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    const skin = doc
      .createSkin("Rig")
      .addJoint(nodes[2])
      .addJoint(nodes[1])
      .setSkeleton(nodes[0])
      .setInverseBindMatrices(
        doc
          .createAccessor()
          .setType("MAT4")
          .setBuffer(buffer)
          .setArray(new Float32Array([...I, ...I, ...I])),
      )
    nodes[3].setSkin(skin)
    await (await createModelIO()).write(input, doc)
    const source = await readFile(input)
    const data = await prepareRig(input)
    expect(data.skins![0].joints).toEqual([2, 1])
    expect(data.skins![0].inverseBindMatrices!.length).toBe(32)
    expect(data.nodes[3].skin).toBe(0)
    const rig = createRig(data),
      animator = createRigAnimator(rig, data.clips!)
    animator.sample(0, 0.5)
    expect(rig.node(2).getLocal().translation[1]).toBeCloseTo(0)
    expect(writeSkinMatrices(rig, 0).every(Number.isFinite)).toBe(true)
    execFileSync(process.execPath.includes("bun") ? "node" : process.execPath, [
      resolve("packages/model/dist/cli.js"),
      "rig",
      input,
      "--out",
      output,
    ])
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(data)
    await expect(generateRig(input, output)).rejects.toThrow()
    expect(await readFile(input)).toEqual(source)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
