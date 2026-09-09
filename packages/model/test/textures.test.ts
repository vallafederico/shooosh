import { test, expect } from "bun:test"
import sharp from "sharp"
import { Document } from "@gltf-transform/core"
import {
  optimizeTextures,
  createModelIO,
  compressModel,
  checkModel,
} from "../dist/node.js"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { execFileSync } from "node:child_process"

test("texture optimization resizes shared color maps, preserves alpha and data samples", async () => {
  const doc = new Document()
  const color = doc
    .createTexture("Color")
    .setMimeType("image/png")
    .setImage(
      await sharp({
        create: {
          width: 128,
          height: 64,
          channels: 4,
          background: { r: 120, g: 30, b: 200, alpha: 0.4 },
        },
      })
        .png({ compressionLevel: 0 })
        .toBuffer(),
    )
  const pixels = Buffer.alloc(64 * 64 * 3)
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 13) % 256
  const data = doc
    .createTexture("Packed")
    .setMimeType("image/png")
    .setImage(
      await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } })
        .png({ compressionLevel: 0 })
        .toBuffer(),
    )
  const a = doc
    .createMaterial("a")
    .setBaseColorTexture(color)
    .setMetallicRoughnessTexture(data)
  const b = doc.createMaterial("b").setBaseColorTexture(color).setNormalTexture(data)
  const report = await optimizeTextures(doc, { maxSize: 32, format: "jpeg", quality: 70 })
  expect(color.getSize()).toEqual([32, 16])
  expect(color.getMimeType()).toBe("image/png")
  expect((await sharp(color.getImage()!).metadata()).hasAlpha).toBe(true)
  expect(data.getSize()).toEqual([64, 64])
  expect(await sharp(data.getImage()!).raw().toBuffer()).toEqual(pixels)
  expect(a.getBaseColorTexture()).toBe(b.getBaseColorTexture())
  expect(report.outputBytes).toBeLessThan(report.inputBytes)
  expect(report.images).toHaveLength(2)
})

test("WebP extension, conversion and optimize CLI integrate; disabling preserves bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "texture-model-"))
  try {
    const doc = new Document()
    doc.createBuffer()
    const image = await sharp({
      create: { width: 256, height: 128, channels: 3, background: "red" },
    })
      .png({ compressionLevel: 0 })
      .toBuffer()
    const texture = doc.createTexture("paint").setImage(image).setMimeType("image/png")
    doc.createMaterial().setBaseColorTexture(texture)
    const io = await createModelIO()
    const input = join(dir, "source.glb")
    await io.write(input, doc)
    const source = await readFile(input)
    const cli = resolve(import.meta.dir, "../dist/cli.js")
    for (const command of ["convert", "optimize"]) {
      const output = join(dir, command + ".glb")
      const report = JSON.parse(
        execFileSync(
          "node",
          [
            cli,
            command,
            input,
            "--out",
            output,
            "--texture-format",
            "webp",
            "--texture-size",
            "64",
          ],
          { encoding: "utf8" },
        ),
      )
      expect(report.textures.outputBytes).toBeLessThan(report.textures.inputBytes)
      const converted = await io.read(output)
      expect(converted.getRoot().listTextures()[0].getSize()).toEqual([64, 32])
      expect(
        converted
          .getRoot()
          .listExtensionsRequired()
          .some((ext) => ext.extensionName === "EXT_texture_webp"),
      ).toBe(true)
      expect((await checkModel(output)).issues.numErrors).toBe(0)
    }
    const disabled = join(dir, "disabled.glb")
    await compressModel(input, disabled, { textures: false })
    expect(
      Buffer.from((await io.read(disabled)).getRoot().listTextures()[0].getImage()!),
    ).toEqual(image)
    expect(await readFile(input)).toEqual(source)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("invalid options and unsupported textures do not mutate source images", async () => {
  const doc = new Document()
  const image = new Uint8Array([1, 2, 3])
  const texture = doc
    .createTexture("compressed")
    .setImage(image)
    .setMimeType("image/ktx2")
  await expect(optimizeTextures(doc, { quality: 101 })).rejects.toThrow()
  await expect(optimizeTextures(doc, { maxSize: 0 })).rejects.toThrow()
  const report = await optimizeTextures(doc)
  expect(texture.getImage()).toBe(image)
  expect(report.images[0].note).toContain("Existing KTX2 retained")
})
