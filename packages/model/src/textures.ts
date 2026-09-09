import { processingTemp } from "./processing-temp.js"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { convertTexture, type KtxOptions } from "./texture-tools.js"
/** Node-only image optimization. Shared image identity and material bindings are retained. */
import type { Document } from "@gltf-transform/core"
import { KHRTextureBasisu, EXTTextureWebP } from "@gltf-transform/extensions"
import sharp from "sharp"

export interface TextureOptions extends Omit<KtxOptions, "signal"> {
  codec?: "etc1s" | "uastc"
  mipmaps?: boolean
  /** Maximum color-map dimension; preserves aspect ratio. Default 2048. */
  maxSize?: number
  /** auto preserves PNG/JPEG/WebP format. Default auto. */
  format?: "auto" | "png" | "jpeg" | "webp" | "ktx2"
  /** JPEG/WebP quality, 1–100. Default 85. */
  quality?: number
}
export interface TextureReport {
  inputBytes: number
  outputBytes: number
  images: {
    id: number
    name: string
    inputBytes: number
    outputBytes: number
    width?: number
    height?: number
    mimeType: string
    note: string
  }[]
}
export function validateTextureOptions(options: TextureOptions = {}) {
  const { maxSize = 2048, format = "auto", quality = 85 } = options
  if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > 32768)
    throw new Error("Texture maxSize must be an integer from 1 to 32768")
  if (!["auto", "png", "jpeg", "webp", "ktx2"].includes(format))
    throw new Error("Texture format must be auto, png, jpeg, webp or ktx2")
  if (!Number.isInteger(quality) || quality < 1 || quality > 100)
    throw new Error("Texture quality must be an integer from 1 to 100")
  return { maxSize, format, quality }
}
export async function optimizeTextures(
  document: Document,
  options: TextureOptions = {},
): Promise<TextureReport> {
  const { maxSize, format, quality } = validateTextureOptions(options)
  const report: TextureReport = { inputBytes: 0, outputBytes: 0, images: [] }
  const changes: {
    texture: ReturnType<Document["createTexture"]>
    image: Uint8Array<ArrayBuffer>
    mime: string
  }[] = []
  for (const [id, texture] of document.getRoot().listTextures().entries()) {
    const image = texture.getImage()
    if (!image) continue
    const mime = texture.getMimeType()
    const entry: TextureReport["images"][number] = {
      id,
      name: texture.getName(),
      inputBytes: image.byteLength,
      outputBytes: image.byteLength,
      mimeType: mime,
      note: "Unchanged",
    }
    report.inputBytes += image.byteLength
    report.images.push(entry)
    // Unknown extension slots and mixed color/data usage receive data-map protection.
    const slots = texture
      .getGraph()
      .listParentEdges(texture)
      .filter((edge) => edge.getParent().propertyType !== "Root")
      .map((edge) => edge.getName())
    const dataMap =
      !slots.length ||
      slots.some((slot) => !["baseColorTexture", "emissiveTexture"].includes(slot))
    if (
      (format === "ktx2" && mime !== "image/ktx2") ||
      (mime === "image/ktx2" && format !== "auto" && format !== "ktx2")
    ) {
      const dir = await processingTemp("model-image-")
      try {
        const source = join(dir, `source.${mime.split("/")[1]}`)
        const targetFormat = dataMap && format === "jpeg" ? "png" : format
        const output = join(dir, `output.${targetFormat}`)
        await writeFile(source, image)
        if (dataMap && format === "ktx2") {
          const dimensions = await sharp(image).metadata()
          if (dimensions.width! % 4 || dimensions.height! % 4)
            throw new Error(
              `Data map ${texture.getName()} must have dimensions divisible by 4 for glTF KTX2; resize it explicitly first`,
            )
        }
        const result = await convertTexture(source, output, {
          ...options,
          gltfCompatible: format === "ktx2",
          format: targetFormat as "png" | "jpeg" | "webp" | "ktx2",
          maxSize: dataMap ? undefined : maxSize,
          colorSpace: dataMap ? "linear" : "srgb",
          codec: dataMap ? "uastc" : options.codec,
          mipmaps: dataMap ? false : options.mipmaps,
        })
        const encoded = new Uint8Array(await readFile(output))
        changes.push({ texture, image: encoded, mime: `image/${targetFormat}` })
        entry.outputBytes = encoded.byteLength
        entry.mimeType = `image/${targetFormat}`
        entry.width = result.output.width
        entry.height = result.output.height
        entry.note = dataMap
          ? "Data map converted using linear transfer; dimensions retained, mip generation disabled"
          : "Texture converted; inspect decoded comparison for quality"
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
      continue
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      entry.note =
        mime === "image/ktx2"
          ? "Existing KTX2 retained without re-encoding; use checkModelTextures for payload validation"
          : "Unsupported encoding retained; no transcoding"
      continue
    }
    const metadata = await sharp(image).metadata()
    entry.width = metadata.width
    entry.height = metadata.height
    if (metadata.depth !== "uchar" || (metadata.pages ?? 1) > 1) {
      entry.note = "High bit-depth or animated image retained"
      continue
    }
    if (dataMap && (mime !== "image/png" || metadata.icc)) {
      entry.note = "Data/unknown map retained to avoid lossy recompression"
      continue
    }
    let target = dataMap ? "png" : format === "auto" ? mime.slice(6) : format
    if (target === "jpeg" && metadata.hasAlpha) target = "png"
    let pipeline = sharp(image)
    const resize = !dataMap && Math.max(metadata.width!, metadata.height!) > maxSize
    if (resize)
      pipeline = pipeline.resize({
        width: maxSize,
        height: maxSize,
        fit: "inside",
        withoutEnlargement: true,
      })
    if (target === "png")
      pipeline = pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
      })
    else if (target === "jpeg")
      pipeline = pipeline.jpeg({ quality, chromaSubsampling: "4:4:4" })
    else pipeline = pipeline.webp({ quality, alphaQuality: 100 })
    const encoded = await pipeline.toBuffer({ resolveWithObject: true })
    if (!resize && encoded.data.byteLength >= image.byteLength) {
      entry.note = "Original retained: encoding did not reduce size"
      continue
    }
    changes.push({
      texture,
      image: new Uint8Array(encoded.data),
      mime: `image/${target}`,
    })
    entry.outputBytes = encoded.data.byteLength
    entry.mimeType = `image/${target}`
    entry.width = encoded.info.width
    entry.height = encoded.info.height
    entry.note = dataMap
      ? "Lossless PNG recompression; data-map dimensions retained"
      : `Color map optimized${resize ? " and resized" : ""}${metadata.hasAlpha && format === "jpeg" ? "; PNG retained for alpha" : ""}`
  }
  for (const { texture, image, mime } of changes)
    texture.setImage(image).setMimeType(mime).setURI("")
  if (
    document
      .getRoot()
      .listTextures()
      .some((texture) => texture.getMimeType() === "image/webp")
  )
    document.createExtension(EXTTextureWebP).setRequired(true)
  if (
    document
      .getRoot()
      .listTextures()
      .some((texture) => texture.getMimeType() === "image/ktx2")
  )
    document.createExtension(KHRTextureBasisu).setRequired(true)
  else
    document
      .getRoot()
      .listExtensionsUsed()
      .find((extension) => extension.extensionName === "KHR_texture_basisu")
      ?.dispose()
  report.outputBytes = report.images.reduce((sum, image) => sum + image.outputBytes, 0)
  return report
}
