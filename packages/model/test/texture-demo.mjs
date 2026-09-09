/** Authored diagnostic image/model pair for manual comparison QA. */
import sharp from "sharp"
import { Document } from "@gltf-transform/core"
import { mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { convertTexture, createModelIO } from "../dist/node.js"
import { KHRTextureBasisu, EXTTextureWebP } from "@gltf-transform/extensions"
const dir = process.argv[2]
if (!dir) throw new Error("Pass a fresh output directory")
await mkdir(dir)
const width = 768,
  height = 512,
  pixels = Buffer.alloc(width * height * 4)
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4,
      u = x / width,
      v = y / height,
      radius = Math.hypot(u - 0.5, (v - 0.5) * 0.67),
      ring = Math.sin(radius * 350),
      grid = x % 64 < 2 || y % 64 < 2
    pixels[i] = grid ? 230 : Math.round(30 + 170 * u + 35 * ring)
    pixels[i + 1] = grid ? 240 : Math.round(35 + 165 * v + 30 * Math.sin(u * 25))
    pixels[i + 2] = grid ? 220 : Math.round(110 + 80 * Math.sin(radius * 12) + 35 * ring)
    pixels[i + 3] =
      radius > 0.36 ? Math.round(Math.max(0.15, 1 - (radius - 0.36) * 5) * 255) : 255
  }
const png = join(dir, "original.png"),
  ktx = join(dir, "converted.ktx2"),
  webp = join(dir, "converted.webp")
await sharp(pixels, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(png)
await convertTexture(png, ktx, { codec: "etc1s", quality: 55 })
await convertTexture(png, webp, { quality: 45, maxSize: 384 })
const io = await createModelIO()
for (const output of [false, true]) {
  const doc = new Document()
  doc.createBuffer()
  for (const [index, name] of [
    "Detail grid · ETC1S",
    "Detail grid · WebP resized",
  ].entries()) {
    const file = output ? (index === 0 ? ktx : webp) : png
    const texture = doc
      .createTexture(name)
      .setMimeType(output ? (index === 0 ? "image/ktx2" : "image/webp") : "image/png")
      .setImage(await readFile(file))
    doc.createMaterial(name).setBaseColorTexture(texture)
  }
  if (output) {
    doc.createExtension(KHRTextureBasisu).setRequired(true)
    doc.createExtension(EXTTextureWebP).setRequired(true)
  }
  await io.write(join(dir, output ? "converted.glb" : "original.glb"), doc)
}
console.log(dir)
