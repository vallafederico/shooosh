import { test, expect } from "bun:test"
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import sharp from "sharp"
import { Document } from "@gltf-transform/core"
import {
  textureToolsStatus,
  convertTexture,
  transcodeTexture,
  inspectTexture,
  checkTexture,
  decodeTexture,
  compareTextures,
  createModelIO,
  compressModel,
  textureComparisons,
  serveTextureComparison,
} from "../dist/node.js"
const hasKtx = (await textureToolsStatus()).available
async function fixture(dir: string) {
  const pixels = Buffer.alloc(128 * 64 * 4)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4
      pixels[i] = x * 2
      pixels[i + 1] = y * 4
      pixels[i + 2] = (x + y) % 2 ? 40 : 220
      pixels[i + 3] = x < 32 ? 100 : 255
    }
  const file = join(dir, "original.png")
  await sharp(pixels, { raw: { width: 128, height: 64, channels: 4 } })
    .png()
    .toFile(file)
  return file
}
test("WebP conversion, alpha, comparison metrics and served comparison assets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "texture-webp-"))
  try {
    const source = await fixture(dir),
      output = join(dir, "converted.webp")
    await convertTexture(source, output, { quality: 65, maxSize: 64 })
    expect((await checkTexture(output)).valid).toBe(true)
    expect((await inspectTexture(output)).width).toBe(64)
    const pair = await compareTextures(source, output)
    expect(pair.report.comparison.rmse).toBeGreaterThan(0)
    expect((await sharp(pair.atlas).metadata()).width).toBe(384)
    expect((await compareTextures(source, source)).report.comparison.identical).toBe(true)
    const server = await serveTextureComparison(source, output)
    try {
      const res = await fetch(server.url + "comparison.json")
      expect(res.status).toBe(200)
      const json: any = await res.json()
      expect(json.items[0].atlas).toBe("0.png")
      expect((await fetch(server.url + "0.png")).headers.get("content-type")).toBe(
        "image/png",
      )
      expect((await fetch(server.url + "../private")).status).toBe(404)
    } finally {
      await server.close()
    }
    await expect(convertTexture(source, output)).rejects.toThrow("Output exists")
    await expect(convertTexture(source, join(dir, "alpha.jpg"))).rejects.toThrow("alpha")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test.skipIf(!hasKtx)(
  "KTX2 ETC1S/UASTC encode, validate, mip decode, GPU transcode and WebP round trip",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "texture-ktx-"))
    try {
      const source = await fixture(dir),
        original = await readFile(source)
      for (const codec of ["etc1s", "uastc"] as const) {
        const output = join(dir, codec + ".ktx2")
        await convertTexture(source, output, { codec })
        const info: any = await inspectTexture(output)
        expect(info.transcodable).toBe(true)
        expect(info.levels).toBe(8)
        expect((await checkTexture(output, { gltf: true })).valid).toBe(true)
        expect(
          (await sharp(await decodeTexture(output, { level: 2 })).metadata()).width,
        ).toBe(32)
        expect(
          (await compareTextures(source, output)).report.comparison.rmse,
        ).toBeLessThan(60)
        await transcodeTexture(output, join(dir, codec + "-bc7.ktx2"), "bc7")
        expect(
          ((await inspectTexture(join(dir, codec + "-bc7.ktx2"))) as any).vkFormat,
        ).toBe(146)
        await transcodeTexture(output, join(dir, codec + "-etc.ktx2"), "etc-rgba")
        expect(
          (await compareTextures(source, join(dir, codec + "-bc7.ktx2"))).report
            .comparison.rmse,
        ).toBeLessThan(60)
        expect(
          (await compareTextures(source, join(dir, codec + "-etc.ktx2"))).report
            .comparison.rmse,
        ).toBeLessThan(60)
        await convertTexture(output, join(dir, codec + ".webp"))
        expect((await checkTexture(join(dir, codec + ".webp"))).valid).toBe(true)
      }
      await transcodeTexture(join(dir, "uastc.ktx2"), join(dir, "astc.ktx2"), "astc")
      expect(
        (await compareTextures(source, join(dir, "astc.ktx2"))).report.comparison.rmse,
      ).toBeLessThan(60)
      await convertTexture(source, join(dir, "linear.ktx2"), {
        colorSpace: "linear",
        gltfCompatible: true,
      })
      expect((await checkTexture(join(dir, "linear.ktx2"), { gltf: true })).valid).toBe(
        true,
      )
      const odd = join(dir, "odd.png")
      await sharp({ create: { width: 11, height: 7, channels: 3, background: "red" } })
        .png()
        .toFile(odd)
      await convertTexture(odd, join(dir, "odd.ktx2"))
      expect((await checkTexture(join(dir, "odd.ktx2"))).valid).toBe(true)
      expect((await checkTexture(join(dir, "odd.ktx2"), { gltf: true })).valid).toBe(
        false,
      )
      await convertTexture(odd, join(dir, "aligned.ktx2"), { gltfCompatible: true })
      expect((await inspectTexture(join(dir, "aligned.ktx2"))).width).toBe(8)
      expect((await checkTexture(join(dir, "aligned.ktx2"), { gltf: true })).valid).toBe(
        true,
      )
      const bad = join(dir, "bad.ktx2")
      await writeFile(bad, (await readFile(join(dir, "uastc.ktx2"))).subarray(0, 100))
      expect((await checkTexture(bad)).valid).toBe(false)
      await expect(decodeTexture(join(dir, "uastc.ktx2"), { level: 50 })).rejects.toThrow(
        "mip",
      )
      expect(await readFile(source)).toEqual(original)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
test.skipIf(!hasKtx)(
  "model texture KTX2 optimization retains bindings and can compare/export WebP",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "model-ktx-"))
    try {
      const image = await fixture(dir),
        doc = new Document()
      doc.createBuffer()
      const texture = doc
        .createTexture("Paint")
        .setMimeType("image/png")
        .setImage(await readFile(image))
      doc.createMaterial("Finish").setBaseColorTexture(texture)
      const io = await createModelIO(),
        source = join(dir, "source.glb"),
        output = join(dir, "compressed.glb")
      await io.write(source, doc)
      await compressModel(source, output, {
        textures: { format: "ktx2", codec: "uastc" },
      })
      const result = await io.read(output)
      expect(
        result
          .getRoot()
          .listExtensionsRequired()
          .some((ext) => ext.extensionName === "KHR_texture_basisu"),
      ).toBe(true)
      expect(result.getRoot().listMaterials()[0].getBaseColorTexture()?.getName()).toBe(
        "Paint",
      )
      const pairs = await textureComparisons(source, output)
      expect(pairs).toHaveLength(1)
      expect(pairs[0].atlas).toBeDefined()
      await compressModel(output, join(dir, "webp.glb"), { textures: { format: "webp" } })
      expect(
        (await io.read(join(dir, "webp.glb"))).getRoot().listTextures()[0].getMimeType(),
      ).toBe("image/webp")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
