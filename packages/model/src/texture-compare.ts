import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"
import sharp from "sharp"
import {
  inspectTexture,
  decodeTexture,
  checkTexture,
  type KtxOptions,
} from "./texture-tools.js"
import { openModel } from "./node.js"
export interface CompareOptions extends KtxOptions {
  level?: number
  previewSize?: number
}
/** Compare decoded RGBA samples at original resolution, capped for bounded preview memory. */
export async function compareTextures(
  original: string,
  converted: string,
  options: CompareOptions = {},
) {
  const size = options.previewSize ?? 1024
  if (!Number.isInteger(size) || size < 1 || size > 4096)
    throw new Error("previewSize must be 1–4096")
  const originalInfo = await inspectTexture(original),
    convertedInfo = await inspectTexture(converted)
  const a = await decodeTexture(original, { ...options, level: 0 }),
    b = await decodeTexture(converted, options)
  const meta = await sharp(a).metadata()
  const scale = Math.min(1, size / Math.max(meta.width!, meta.height!))
  const width = Math.max(1, Math.round(meta.width! * scale)),
    height = Math.max(1, Math.round(meta.height! * scale))
  const pixels = async (png: Buffer) =>
    sharp(png)
      .resize(width, height, { fit: "fill", kernel: "nearest" })
      .ensureAlpha()
      .raw()
      .toBuffer()
  const left = await pixels(a),
    right = await pixels(b),
    difference = Buffer.alloc(left.length)
  let squared = 0,
    maximum = 0
  for (let i = 0; i < left.length; i++) {
    const error = Math.abs(left[i] - right[i])
    squared += error * error
    maximum = Math.max(maximum, error)
    difference[i] = i % 4 === 3 ? 255 : Math.min(255, error * 4)
  }
  const atlas = await sharp({
    create: {
      width: width * 3,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      [left, right, difference].map((input, index) => ({
        input,
        raw: { width, height, channels: 4 as const },
        left: width * index,
        top: 0,
      })),
    )
    .png()
    .toBuffer()
  const rmse = Math.sqrt(squared / left.length)
  return {
    atlas,
    report: {
      original: originalInfo,
      converted: convertedInfo,
      validation: {
        original: await checkTexture(original, options),
        converted: await checkTexture(converted, options),
      },
      comparison: {
        width,
        height,
        level: options.level ?? 0,
        rmse,
        psnrDb: rmse === 0 ? null : 20 * Math.log10(255 / rmse),
        maxChannelError: maximum,
        identical: maximum === 0,
        note: "RGBA sample metrics at preview resolution. Original resolution capped for preview; converted resampled to match with nearest-neighbor; difference RGB amplified 4×. Not a perceptual or native GPU rendering test.",
      },
    },
  }
}
/** Pair model images by preserved texture index; names are displayed for manual verification. */
export async function textureComparisons(
  original: string,
  converted: string,
  options: CompareOptions = {},
) {
  const model = (path: string) => [".glb", ".gltf"].includes(extname(path).toLowerCase())
  if (model(original) !== model(converted))
    throw new Error("Compare two models or two texture files")
  if (!model(original)) {
    const result = await compareTextures(original, converted, options)
    return [{ name: "Texture", ...result }]
  }
  const left = (await openModel(original)).document.getRoot().listTextures()
  const right = (await openModel(converted)).document.getRoot().listTextures()
  const dir = await mkdtemp(join(tmpdir(), "model-comparison-"))
  const results: {
    name: string
    atlas?: Buffer
    report?: Awaited<ReturnType<typeof compareTextures>>["report"]
    error?: string
  }[] = []
  try {
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const name = `${i}: ${left[i]?.getName() || "Unnamed"} → ${right[i]?.getName() || "Unnamed"}`
      try {
        if (!left[i]?.getImage() || !right[i]?.getImage())
          throw new Error("Missing image at matching index")
        const a = join(dir, `a.${left[i].getMimeType().split("/")[1]}`),
          b = join(dir, `b.${right[i].getMimeType().split("/")[1]}`)
        await writeFile(a, left[i].getImage()!)
        await writeFile(b, right[i].getImage()!)
        results.push({ name, ...(await compareTextures(a, b, options)) })
      } catch (error) {
        results.push({ name, error: String(error) })
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return results
}
/** Validate every embedded/referenced image, including KTX2 payloads the glTF validator cannot decode. */
export async function checkModelTextures(input: string, options: KtxOptions = {}) {
  const textures = (await openModel(input)).document.getRoot().listTextures()
  const dir = await mkdtemp(join(tmpdir(), "model-texture-check-"))
  const images: {
    id: number
    name: string
    result: Awaited<ReturnType<typeof checkTexture>>
  }[] = []
  try {
    for (const [id, texture] of textures.entries()) {
      const file = join(dir, `${id}.${texture.getMimeType().split("/")[1]}`)
      if (!texture.getImage()) {
        images.push({
          id,
          name: texture.getName(),
          result: { valid: false, error: "Missing image" },
        })
        continue
      }
      await writeFile(file, texture.getImage()!)
      images.push({
        id,
        name: texture.getName(),
        result: await checkTexture(file, {
          ...options,
          gltf: texture.getMimeType() === "image/ktx2",
        }),
      })
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  return { valid: images.every((image) => image.result.valid), images }
}
