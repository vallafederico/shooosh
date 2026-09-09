import { runKtx } from "./texture-tools.js"
import { processingTemp } from "./processing-temp.js"
import {
  validateTextureOptions,
  type TextureOptions,
  type TextureReport,
} from "./textures.js"
/** Node-only format conversion, isolated to a disposable worker. */
import { Worker } from "node:worker_threads"
import { resolve, extname } from "node:path"
import { access, writeFile, rm } from "node:fs/promises"

export const importFormats = [
  "fbx",
  "obj",
  "dae",
  "stl",
  "ply",
  "3ds",
  "off",
  "gltf",
  "glb",
] as const
export interface ConvertOptions {
  /** Enabled by default. false preserves source image bytes. */
  textures?: false | TextureOptions
  /** Directory containing sidecar materials/textures. Defaults to the input directory. */
  resourceDirectory?: string
  /** Default: 120 seconds. Includes parsing, packing and validation. */
  timeoutMs?: number
  signal?: AbortSignal
}
export interface ConversionReport {
  output: string
  inputFormat: string
  outputBytes: number
  warnings: string[]
  textures?: TextureReport
  validation: { numErrors: number; numWarnings: number; messages: unknown[] }
}
export async function convertModel(
  input: string,
  output: string,
  options: ConvertOptions = {},
): Promise<ConversionReport> {
  if (options.textures !== false) validateTextureOptions(options.textures)
  const format = extname(input).slice(1).toLowerCase()
  if (!(importFormats as readonly string[]).includes(format))
    throw new Error(
      `Unsupported input .${format}. Supported: ${importFormats.join(", ")}`,
    )
  if (extname(output).toLowerCase() !== ".glb")
    throw new Error("Conversion output must be .glb")
  const timeout = options.timeoutMs ?? 120_000
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647)
    throw new Error("timeoutMs must be a positive timer duration")
  options.signal?.throwIfAborted()
  try {
    await access(output)
    throw new Error(`Output exists: ${output}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const tempRoot = await processingTemp("model-conversion-")
  const result = await new Promise<{
    bytes: Uint8Array
    warnings: string[]
    textures?: TextureReport
    validation: ConversionReport["validation"]
  }>((done, reject) => {
    const worker = new Worker(new URL("./convert-worker.js", import.meta.url), {
      execArgv: [], // The worker runs built JS; do not inherit --input-type/--eval/loaders.
      workerData: {
        modelConversion: true,
        tempRoot,
        input: resolve(input),
        format,
        textures: options.textures,
        resourceDirectory:
          options.resourceDirectory && resolve(options.resourceDirectory),
      },
    })
    const tasks = new Set<Promise<unknown>>()
    const cancel = new AbortController()
    let settled = false
    const finish = async (error?: unknown, value?: any) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", abort)
      cancel.abort()
      await Promise.allSettled([worker.terminate(), ...tasks])
      if (error) reject(error)
      else done(value)
    }
    const abort = () => finish(options.signal?.reason ?? new Error("Conversion aborted"))
    const timer = setTimeout(
      () => finish(new Error(`Conversion timed out after ${timeout}ms`)),
      timeout,
    )
    worker.once("error", finish)
    worker.once("exit", (code) => finish(new Error(`Converter exited (${code})`)))
    worker.on("message", (message) => {
      if (settled) return
      if (message.kind === "ktx") {
        const task = runKtx(message.args, {
          ...message.options,
          signal: cancel.signal,
        }).then(
          (result) => {
            if (!settled)
              worker.postMessage({ kind: "ktx-result", id: message.id, result })
          },
          (error) => {
            if (!settled)
              worker.postMessage({
                kind: "ktx-result",
                id: message.id,
                error: String(error),
              })
          },
        )
        tasks.add(task)
        void task.finally(() => tasks.delete(task))
      } else void finish(message.error ? new Error(message.error) : undefined, message)
    })
    options.signal?.addEventListener("abort", abort, { once: true })
    if (options.signal?.aborted) abort()
  }).finally(() => rm(tempRoot, { recursive: true, force: true }))
  options.signal?.throwIfAborted()
  await writeFile(output, result.bytes, { flag: "wx" })
  return {
    output,
    inputFormat: format,
    outputBytes: result.bytes.byteLength,
    warnings: result.warnings,
    textures: result.textures,
    validation: result.validation,
  }
}
