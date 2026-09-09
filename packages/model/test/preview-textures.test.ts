import { test, expect } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { makeFixture } from "./fixture"
import { prepareModel, createModelIO } from "../src/node"

test("textured preparation preserves UVs through flat-normal splits, aligns buffers, and leaves default output/source untouched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-textured-test-"))
  try {
    const input = join(dir, "source.glb")
    const doc = await makeFixture(input)
    const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0]
    const uvs = new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1, -1, 2, 2, -1, 0.25, 0.75, 0.75, 0.25,
    ])
    const indices = Array.from(primitive.getIndices()!.getArray()!)
    primitive.setAttribute(
      "TEXCOORD_0",
      doc
        .createAccessor()
        .setType("VEC2")
        .setBuffer(doc.getRoot().listBuffers()[0])
        .setArray(uvs),
    )
    // Asymmetric image checks that CLI processing does not flip texture rows.
    const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0])
    const texture = doc
      .createTexture()
      .setMimeType("image/png")
      .setImage(
        await sharp(pixels, { raw: { width: 2, height: 2, channels: 3 } })
          .png()
          .toBuffer(),
      )
    const material = primitive.getMaterial()!.setBaseColorTexture(texture)
    material.getBaseColorTextureInfo()!.setWrapS(33648).setWrapT(33071)
    const io = await createModelIO()
    await io.write(input, doc)
    const source = await readFile(input)
    const plain = await prepareModel(input)
    expect(plain.prepared.textures).toBeUndefined()
    expect(plain.prepared.geometry[0].uvOffset).toBeUndefined()
    const preview = await prepareModel(input, { textures: true })
    const geometry = preview.prepared.geometry[0]
    expect(geometry.verticesOffset % 4).toBe(0)
    expect(geometry.indicesOffset % 4).toBe(0)
    expect(geometry.uvOffset! % 4).toBe(0)
    const actual = new Float32Array(
      preview.binary.buffer,
      preview.binary.byteOffset + geometry.uvOffset!,
      indices.length * 2,
    )
    expect(Array.from(actual)).toEqual(
      indices.flatMap((index) => [uvs[index * 2], uvs[index * 2 + 1]]),
    )
    const image = preview.prepared.textures![0]
    expect([image.wrapS, image.wrapT]).toEqual([33648, 33071])
    const decoded = await sharp(
      preview.binary.subarray(image.offset, image.offset + image.length),
    )
      .removeAlpha()
      .raw()
      .toBuffer()
    expect(decoded).toEqual(pixels)
    expect((await prepareModel(input)).binary).toEqual(plain.binary)
    expect(await readFile(input)).toEqual(source)
    material.getBaseColorTextureInfo()!.setTexCoord(1)
    await io.write(input, doc)
    const unsupported = await prepareModel(input, { textures: true })
    expect(unsupported.prepared.textures).toBeUndefined()
    expect(unsupported.prepared.limitations.join(" ")).toContain("TEXCOORD_0")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
