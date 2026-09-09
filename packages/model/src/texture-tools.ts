import { isMainThread, parentPort, workerData } from "node:worker_threads"
import { processingTemp } from "./processing-temp.js"
/** Node texture IO. KTX operations use the official KTX-Software 4.4+ executable. */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, writeFile, mkdtemp, rm, access } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import { join, resolve, extname } from "node:path"
import sharp from "sharp"
const exec = promisify(execFile)
export interface KtxOptions {
  ktxPath?: string
  timeoutMs?: number
  signal?: AbortSignal
}
export interface TextureConvertOptions extends KtxOptions {
  /** Align dimensions to multiples of four and validate KHR_texture_basisu compatibility. */
  gltfCompatible?: boolean
  format?: "png" | "jpeg" | "webp" | "ktx2"
  codec?: "etc1s" | "uastc"
  colorSpace?: "srgb" | "linear"
  mipmaps?: boolean
  quality?: number
  maxSize?: number
  level?: number
}
export const gpuTextureTargets = [
  "bc1",
  "bc3",
  "bc4",
  "bc5",
  "bc7",
  "etc-rgb",
  "etc-rgba",
  "eac-r11",
  "eac-rg11",
  "astc",
  "rgba8",
] as const
export type GpuTextureTarget = (typeof gpuTextureTargets)[number]
function executable(options: KtxOptions) {
  const local = join(homedir(), ".local/share/shooosh-model/ktx/bin/ktx")
  return (
    options.ktxPath ??
    process.env.SHOOOSH_KTX_BINARY ??
    (existsSync(local) ? local : "ktx")
  )
}
let rpcId = 0
export async function runKtx(
  args: string[],
  options: KtxOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  if (!isMainThread && workerData?.modelConversion) {
    const id = ++rpcId
    return new Promise((resolve, reject) => {
      const receive = (message: any) => {
        if (message.kind !== "ktx-result" || message.id !== id) return
        parentPort!.off("message", receive)
        if (message.error) reject(new Error(message.error))
        else resolve(message.result)
      }
      parentPort!.on("message", receive)
      parentPort!.postMessage({
        kind: "ktx",
        id,
        args,
        options: { ktxPath: options.ktxPath, timeoutMs: options.timeoutMs },
      })
    })
  }
  const timeout = options.timeoutMs ?? 120_000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647)
    throw new Error("Invalid KTX timeoutMs")
  try {
    return await exec(executable(options), args, {
      timeout,
      killSignal: "SIGKILL",
      signal: options.signal,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (error: any) {
    if (error.code === "ENOENT")
      throw new Error(
        "KTX tools not found. Install KTX-Software 4.4+ and put ktx on PATH, set SHOOOSH_KTX_BINARY, or pass ktxPath.",
      )
    throw new Error(
      `KTX ${args[0]} failed: ${error.stderr || error.stdout || error.message}`,
    )
  }
}
export async function textureToolsStatus(options: KtxOptions = {}) {
  try {
    return {
      available: true,
      version: (await runKtx(["--version"], options)).stdout.trim(),
    }
  } catch (error) {
    return { available: false, error: String(error) }
  }
}
const magic = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
])
export function inspectKtx2(bytes: Uint8Array) {
  const data = Buffer.from(bytes)
  if (data.length < 80 || !data.subarray(0, 12).equals(magic))
    throw new Error("Invalid KTX2 header")
  const u32 = (offset: number) => data.readUInt32LE(offset)
  const u64 = (offset: number) => {
    const n = data.readBigUInt64LE(offset)
    if (n > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error("KTX2 offset exceeds safe range")
    return Number(n)
  }
  const levels = Math.max(1, u32(40))
  if (!levels || levels > 32 || 80 + levels * 24 > data.length)
    throw new Error("Invalid KTX2 level index")
  const mips = Array.from({ length: levels }, (_, level) => {
    const offset = u64(80 + level * 24),
      byteLength = u64(88 + level * 24),
      uncompressedBytes = u64(96 + level * 24)
    if (offset < 80 + levels * 24 || byteLength < 1 || offset + byteLength > data.length)
      throw new Error(`Invalid KTX2 mip ${level} range`)
    return {
      level,
      width: Math.max(1, Math.floor(u32(20) / 2 ** level)),
      height: Math.max(1, Math.floor(u32(24) / 2 ** level)),
      byteLength,
      uncompressedBytes,
    }
  })
  const dfd = u32(48)
  if (dfd < 80 || dfd + u32(52) > data.length || u32(52) < 24)
    throw new Error("Invalid KTX2 data format descriptor")
  const model = data[dfd + 12]
  return {
    format: "ktx2",
    bytes: data.length,
    width: u32(20),
    height: u32(24),
    depth: u32(28),
    layers: u32(32),
    faces: u32(36),
    levels,
    vkFormat: u32(12),
    encoding:
      model === 163
        ? "ETC1S"
        : model === 166
          ? "UASTC"
          : ((
              {
                131: "BC1 RGB",
                132: "BC1 RGB sRGB",
                133: "BC1 RGBA",
                134: "BC1 RGBA sRGB",
                137: "BC3",
                138: "BC3 sRGB",
                139: "BC4",
                141: "BC5",
                145: "BC7",
                146: "BC7 sRGB",
                147: "ETC2 RGB",
                148: "ETC2 RGB sRGB",
                151: "ETC2 RGBA",
                152: "ETC2 RGBA sRGB",
                157: "ASTC 4×4",
                158: "ASTC 4×4 sRGB",
                37: "RGBA8",
                43: "RGBA8 sRGB",
              } as Record<number, string>
            )[u32(12)] ?? `VkFormat ${u32(12)}`),
    nativePayloadBytes: u32(12)
      ? mips.reduce((sum, mip) => sum + mip.uncompressedBytes, 0)
      : null,
    supercompression: u32(44),
    colorModel: model,
    colorSpace: data[dfd + 14] === 2 ? "srgb" : "linear/other",
    transcodable: model === 163 || model === 166,
    mips,
  }
}
export async function inspectTexture(input: string) {
  const bytes = await readFile(input)
  if (bytes.subarray(0, 12).equals(magic) || extname(input).toLowerCase() === ".ktx2")
    return inspectKtx2(bytes)
  const metadata = await sharp(bytes).metadata()
  return {
    format: metadata.format,
    bytes: bytes.length,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
    pages: metadata.pages ?? 1,
    alpha: metadata.hasAlpha,
    depth: metadata.depth,
    levels: 1,
    colorSpace: metadata.space,
  }
}
export async function checkTexture(
  input: string,
  options: KtxOptions & { gltf?: boolean } = {},
) {
  try {
    const info = await inspectTexture(input)
    if (info.format === "ktx2") {
      const result = await runKtx(
        [
          "validate",
          "--format",
          "json",
          ...(options.gltf ? ["--gltf-basisu"] : []),
          resolve(input),
        ],
        options,
      )
      return { valid: true, info, diagnostics: JSON.parse(result.stdout) }
    }
    await sharp(await readFile(input))
      .raw()
      .toBuffer()
    return { valid: true, info, diagnostics: null }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) }
  }
}
async function temp<T>(fn: (dir: string) => Promise<T>) {
  const dir = await processingTemp("shooosh-texture-")
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
async function newOutput(output: string) {
  try {
    await access(output)
  } catch (e: any) {
    if (e.code === "ENOENT") return
    throw e
  }
  throw new Error(`Output exists: ${output}`)
}
export async function decodeTexture(
  input: string,
  options: KtxOptions & { level?: number } = {},
): Promise<Buffer> {
  const info = await inspectTexture(input)
  const level = options.level ?? 0
  if (!Number.isInteger(level) || level < 0 || level >= info.levels)
    throw new Error("Invalid mip level")
  if (info.format !== "ktx2")
    return sharp(await readFile(input))
      .png()
      .toBuffer()
  const ktx = info as ReturnType<typeof inspectKtx2>
  if (ktx.faces !== 1 || ktx.layers > 1 || ktx.depth > 1)
    throw new Error(
      "Preview currently supports 2D textures only, not arrays, cubemaps or volumes",
    )
  return temp(async (dir) => {
    const native = new Map<number, [string, number]>([
      [131, ["decode_bc1", 8]],
      [132, ["decode_bc1", 8]],
      [133, ["decode_bc1", 8]],
      [134, ["decode_bc1", 8]],
      [137, ["decode_bc3", 16]],
      [138, ["decode_bc3", 16]],
      [139, ["decode_bc4", 8]],
      [141, ["decode_bc5", 16]],
      [145, ["decode_bc7", 16]],
      [146, ["decode_bc7", 16]],
      [147, ["decode_etc2", 8]],
      [148, ["decode_etc2", 8]],
      [149, ["decode_etc2a1", 8]],
      [150, ["decode_etc2a1", 8]],
      [151, ["decode_etc2a8", 16]],
      [152, ["decode_etc2a8", 16]],
      [153, ["decode_eacr", 8]],
      [155, ["decode_eacrg", 16]],
      [157, ["decode_astc", 16]],
      [158, ["decode_astc", 16]],
    ]).get(ktx.vkFormat)
    if (native) {
      const { width, height } = ktx.mips[level]
      if (width * height > 16_777_216)
        throw new Error(
          "Native GPU preview is limited to 16 million pixels; choose a smaller mip",
        )
      const raw = join(dir, "blocks.raw")
      await runKtx(
        ["extract", "--raw", "--level", String(level), resolve(input), raw],
        options,
      )
      const blocks = await readFile(raw)
      if (blocks.length !== Math.ceil(width / 4) * Math.ceil(height / 4) * native[1])
        throw new Error("Unexpected compressed block byte length")
      const decoder = await import("texture2ddecoder-wasm")
      const fn = decoder[native[0] as keyof typeof decoder] as (
        ...args: any[]
      ) => Promise<Uint8Array | null>
      const bgra = await fn(blocks, width, height, 4, 4)
      if (!bgra || bgra.length !== width * height * 4)
        throw new Error("GPU texture decode failed")
      const rgba = Buffer.from(bgra)
      for (let i = 0; i < rgba.length; i += 4) {
        const b = rgba[i]
        rgba[i] = rgba[i + 2]
        rgba[i + 2] = b
      }
      return sharp(rgba, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer()
    }
    const png = join(dir, "decoded.png")
    await runKtx(
      [
        "extract",
        "--level",
        String(level),
        ...(ktx.transcodable ? ["--transcode", "rgba8"] : []),
        resolve(input),
        png,
      ],
      options,
    )
    try {
      return await sharp(await readFile(png))
        .png()
        .toBuffer()
    } catch {
      throw new Error(
        "This native GPU format cannot be decoded to PNG by KTX extract. Compare its Basis source instead.",
      )
    }
  })
}
export async function convertTexture(
  input: string,
  output: string,
  options: TextureConvertOptions = {},
) {
  await newOutput(output)
  const format =
    options.format ?? extname(output).slice(1).toLowerCase().replace("jpg", "jpeg")
  if (!["png", "jpeg", "webp", "ktx2"].includes(format))
    throw new Error("Texture output must be PNG, JPEG, WebP or KTX2")
  const extension = extname(output).slice(1).toLowerCase().replace("jpg", "jpeg")
  if (extension !== format) throw new Error("Texture output extension must match format")
  const quality = options.quality ?? 85
  if (!Number.isInteger(quality) || quality < 1 || quality > 100)
    throw new Error("Quality must be 1–100")
  if (
    options.maxSize !== undefined &&
    (!Number.isInteger(options.maxSize) || options.maxSize < 1 || options.maxSize > 32768)
  )
    throw new Error("maxSize must be 1–32768")
  if (options.codec && !["etc1s", "uastc"].includes(options.codec))
    throw new Error("Invalid KTX codec")
  if (options.colorSpace && !["linear", "srgb"].includes(options.colorSpace))
    throw new Error("Invalid colorSpace")
  const sourceInfo = await inspectTexture(input)
  if (
    sourceInfo.format !== "ktx2" &&
    ((typeof sourceInfo.depth === "string" && sourceInfo.depth !== "uchar") ||
      ("pages" in sourceInfo && sourceInfo.pages > 1))
  )
    throw new Error(
      "Texture conversion currently accepts single-frame 8-bit images; high-bit-depth/HDR and animation require an explicit preprocessing step",
    )
  const png = await decodeTexture(input, options)
  let image = sharp(png)
  if (options.maxSize)
    image = image.resize({
      width: options.maxSize,
      height: options.maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
  let prepared = await image.png().toBuffer()
  if (format === "ktx2" && options.gltfCompatible) {
    const size = await sharp(prepared).metadata()
    if (size.width! % 4 || size.height! % 4)
      prepared = await sharp(prepared)
        .resize(
          Math.max(4, Math.floor(size.width! / 4) * 4),
          Math.max(4, Math.floor(size.height! / 4) * 4),
          { fit: "fill" },
        )
        .png()
        .toBuffer()
  }
  const metadata = await sharp(prepared).metadata()
  if (format === "jpeg" && metadata.hasAlpha)
    throw new Error("JPEG cannot preserve alpha. Choose PNG or WebP.")
  const bytes = await temp(async (dir) => {
    if (format !== "ktx2")
      return format === "webp"
        ? sharp(prepared).webp({ quality, alphaQuality: 100 }).toBuffer()
        : format === "jpeg"
          ? sharp(prepared).jpeg({ quality, chromaSubsampling: "4:4:4" }).toBuffer()
          : sharp(prepared).png({ compressionLevel: 9 }).toBuffer()
    const source = join(dir, "source.png"),
      target = join(dir, "target.ktx2")
    await writeFile(source, prepared)
    const srgb = (options.colorSpace ?? "srgb") === "srgb"
    await runKtx(
      [
        "create",
        "--format",
        srgb ? "R8G8B8A8_SRGB" : "R8G8B8A8_UNORM",
        "--assign-primaries",
        srgb ? "bt709" : "none",
        "--assign-tf",
        srgb ? "srgb" : "linear",
        "--encode",
        options.codec === "etc1s" ? "basis-lz" : "uastc",
        ...(options.codec === "etc1s"
          ? ["--qlevel", String(Math.round((quality * 254) / 100) + 1)]
          : ["--uastc-quality", "2", "--zstd", "9"]),
        ...(options.mipmaps === false ? [] : ["--generate-mipmap"]),
        "--threads",
        "2",
        source,
        target,
      ],
      options,
    )
    const validation = await checkTexture(target, {
      ...options,
      gltf: options.gltfCompatible,
    })
    if (!validation.valid) throw new Error(validation.error)
    return readFile(target)
  })
  options.signal?.throwIfAborted()
  await writeFile(output, bytes, { flag: "wx" })
  return {
    input: await inspectTexture(input),
    output: await inspectTexture(output),
    path: output,
  }
}
export async function transcodeTexture(
  input: string,
  output: string,
  target: GpuTextureTarget,
  options: KtxOptions = {},
) {
  await newOutput(output)
  if (extname(output).toLowerCase() !== ".ktx2" || !gpuTextureTargets.includes(target))
    throw new Error("Choose a supported GPU target and .ktx2 output")
  const info = inspectKtx2(await readFile(input))
  if (!info.transcodable)
    throw new Error("Transcoding requires ETC1S or UASTC KTX2 input")
  const bytes = await temp(async (dir) => {
    const path = join(dir, "target.ktx2")
    await runKtx(["transcode", "--target", target, resolve(input), path], options)
    const validation = await checkTexture(path, options)
    if (!validation.valid) throw new Error(validation.error)
    return readFile(path)
  })
  options.signal?.throwIfAborted()
  await writeFile(output, bytes, { flag: "wx" })
  return inspectTexture(output)
}
