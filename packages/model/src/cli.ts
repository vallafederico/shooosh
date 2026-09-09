#!/usr/bin/env node
import { parseArgs } from "node:util"
import { readFile } from "node:fs/promises"
import {
  checkModelTextures,
  inspectTexture,
  checkTexture,
  convertTexture,
  transcodeTexture,
  serveTextureComparison,
  textureToolsStatus,
  convertModel,
  inspectModel,
  checkModel,
  editModel,
  compressModel,
  generateInterface,
  generateRig,
} from "./node.js"
import { serveModel } from "./server.js"
const help = `shooosh-model — model assets and runtime controls\n
  convert  input.fbx --out model.glb [--resources directory]
  inspect  input.glb                     Scene inventory as JSON; no geometry decode
  check    input.glb                     Khronos validation report; exit 1 on errors
  edit     input.glb --patch edits.json --out edited.glb
  compress input.glb --out compact.glb   Meshopt + texture optimization; preserves hierarchy
  optimize input.glb --out optimized.glb Same as compress
  generate input.glb --out Product.ts [--url /models/Product.model.json]
                                        Typed controls + prepared .model.json/.model.bin
  rig      input.glb --out Product.rig.json  Bone hierarchy, bind matrices and TRS clips
  texture-tools                         KTX tool availability/version
  texture-inspect image.ktx2            Texture dimensions, mips and encoding
  texture-check image.ktx2              Full decode / Khronos validation
  texture-convert image.png --out image.ktx2 [--codec uastc|etc1s]
  texture-transcode image.ktx2 --out image-bc7.ktx2 --target bc7
  texture-view original.png --compare converted.ktx2 [--level 0] [--port 0]
                                        Also accepts an original/converted GLB pair
  view     input.glb [--port 0]          Local shooosh 3D workbench (WebGPU/WebGL2)

Convert inputs: FBX, OBJ, DAE, STL, PLY, 3DS, OFF, glTF/GLB.
Other commands: local .glb or .gltf with local resources. Output paths must not exist.
Texture flags (convert/compress/optimize): --texture-size 2048 --texture-format auto|png|jpeg|webp|ktx2 --texture-quality 85 --textures off
Runtime rendering: rigid triangles and base-color textures. The separate shooosh/rig entry samples bone poses; the workbench does not yet deform skinned meshes or play clips.
`
async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || ["help", "--help", "-h"].includes(command)) {
    console.log(help)
    return
  }
  if (command === "texture-tools") {
    console.log(JSON.stringify(await textureToolsStatus(), null, 2))
    return
  }
  const textureFlags = {
    codec: { type: "string" as const },
    mipmaps: { type: "string" as const },
    "texture-size": { type: "string" as const },
    "texture-format": { type: "string" as const },
    "texture-quality": { type: "string" as const },
    textures: { type: "string" as const },
  }
  const spec: Record<string, Record<string, { type: "string" }>> = {
    convert: { ...textureFlags, out: { type: "string" }, resources: { type: "string" } },
    "texture-inspect": {},
    "texture-check": {},
    "texture-convert": {
      out: { type: "string" },
      codec: { type: "string" },
      quality: { type: "string" },
      size: { type: "string" },
      "color-space": { type: "string" },
      mipmaps: { type: "string" },
    },
    "texture-transcode": { out: { type: "string" }, target: { type: "string" } },
    "texture-view": {
      compare: { type: "string" },
      level: { type: "string" },
      port: { type: "string" },
    },
    inspect: {},
    check: {},
    edit: { patch: { type: "string" }, out: { type: "string" } },
    compress: { ...textureFlags, out: { type: "string" } },
    optimize: { ...textureFlags, out: { type: "string" } },
    rig: { out: { type: "string" } },
    generate: { out: { type: "string" }, url: { type: "string" } },
    view: { port: { type: "string" } },
  }
  if (!spec[command])
    throw new Error(`Unknown command ${command}. Run shooosh-model --help.`)
  const { values, positionals } = parseArgs({
    args,
    options: spec[command],
    allowPositionals: true,
    strict: true,
  })
  if (positionals.length !== 1) throw new Error("Provide exactly one input model path")
  const input = positionals[0]
  const required = (key: string) => {
    const value = values[key]
    if (typeof value !== "string" || !value) throw new Error(`Missing --${key}`)
    return value
  }
  const mipmaps = () => {
    if (values.mipmaps !== undefined && !["on", "off"].includes(String(values.mipmaps)))
      throw new Error("--mipmaps must be on or off")
    return values.mipmaps === undefined ? undefined : values.mipmaps !== "off"
  }
  const textureOptions = () => {
    if (
      values.textures !== undefined &&
      values.textures !== "off" &&
      values.textures !== "on"
    )
      throw new Error("--textures must be on or off")
    if (values.textures === "off") return false as const
    return {
      codec: values.codec as "uastc" | "etc1s" | undefined,
      mipmaps: mipmaps(),
      maxSize:
        values["texture-size"] === undefined ? undefined : Number(values["texture-size"]),
      quality:
        values["texture-quality"] === undefined
          ? undefined
          : Number(values["texture-quality"]),
      format: values[
        "texture-format"
      ] as import("./textures.js").TextureOptions["format"],
    }
  }
  switch (command) {
    case "rig":
      console.log(JSON.stringify(await generateRig(input, required("out")), null, 2))
      break
    case "texture-inspect":
      console.log(JSON.stringify(await inspectTexture(input), null, 2))
      break
    case "texture-check": {
      const report = /\.gl(?:b|tf)$/i.test(input)
        ? await checkModelTextures(input)
        : await checkTexture(input)
      console.log(JSON.stringify(report, null, 2))
      if (!report.valid) process.exitCode = 1
      break
    }
    case "texture-convert":
      console.log(
        JSON.stringify(
          await convertTexture(input, required("out"), {
            codec: values.codec as "etc1s" | "uastc",
            quality: values.quality === undefined ? undefined : Number(values.quality),
            maxSize: values.size === undefined ? undefined : Number(values.size),
            colorSpace: values["color-space"] as "linear" | "srgb",
            mipmaps: mipmaps(),
          }),
          null,
          2,
        ),
      )
      break
    case "texture-transcode":
      console.log(
        JSON.stringify(
          await transcodeTexture(
            input,
            required("out"),
            required("target") as import("./texture-tools.js").GpuTextureTarget,
          ),
          null,
          2,
        ),
      )
      break
    case "texture-view": {
      const server = await serveTextureComparison(input, required("compare"), {
        level: values.level === undefined ? undefined : Number(values.level),
        port: values.port === undefined ? 0 : Number(values.port),
      })
      console.log(`Texture comparison: ${server.url}`)
      const close = () => {
        void server.close().then(() => process.exit(0))
      }
      process.once("SIGINT", close)
      process.once("SIGTERM", close)
      break
    }
    case "convert":
      console.log(
        JSON.stringify(
          await convertModel(input, required("out"), {
            textures: textureOptions(),
            resourceDirectory: values.resources as string | undefined,
          }),
          null,
          2,
        ),
      )
      break
    case "inspect":
      console.log(JSON.stringify(await inspectModel(input), null, 2))
      break
    case "check": {
      const report = await checkModel(input)
      console.log(JSON.stringify(report, null, 2))
      if (report.issues.numErrors) process.exitCode = 1
      break
    }
    case "edit":
      await editModel(
        input,
        required("out"),
        JSON.parse(await readFile(required("patch"), "utf8")),
      )
      console.log(`Wrote ${values.out}`)
      break
    case "optimize":
    case "compress":
      console.log(
        JSON.stringify(
          await compressModel(input, required("out"), { textures: textureOptions() }),
          null,
          2,
        ),
      )
      break
    case "generate":
      console.log(
        JSON.stringify(
          await generateInterface(
            input,
            required("out"),
            values.url as string | undefined,
          ),
          null,
          2,
        ),
      )
      break
    case "view": {
      const server = await serveModel(
        input,
        values.port === undefined ? 0 : Number(values.port),
      )
      console.log(`Model workbench: ${server.url}\nLocal only. Ctrl+C to stop.`)
      const close = () => {
        void server.close().then(() => process.exit(0))
      }
      process.once("SIGINT", close)
      process.once("SIGTERM", close)
      break
    }
  }
}
main().catch((error) => {
  console.error(
    `shooosh-model: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})
