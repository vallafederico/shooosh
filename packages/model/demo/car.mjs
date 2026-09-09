/** User-supplied car by cuadot: keep source assets outside the package. */
import { resolve, join } from "node:path"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import sharp from "sharp"
import {
  convertModel,
  createModelIO,
  optimizeModel,
  checkModel,
  checkModelTextures,
  serveTextureComparison,
} from "../dist/node.js"
import { serveModel } from "../dist/server.js"
const [inputArg, outputArg] = process.argv.slice(2)
if (!inputArg || !outputArg)
  throw new Error("Usage: node demo/car.mjs /path/to/car /path/to/new-output")
const input = resolve(inputArg),
  output = resolve(outputArg)
await mkdir(output) // never reuse/overwrite a demo output directory
const attribution = {
  name: "cuadot",
  url: "https://sketchfab.com/cuadot",
  note: "Car · static reference-pose preview",
}
const conversion = await convertModel(
  join(input, "source/Car.fbx"),
  join(output, "imported.glb"),
  { resourceDirectory: join(input, "textures"), textures: false },
)
const io = await createModelIO(),
  document = await io.read(join(output, "imported.glb"))
// FBX imports the embedded color, normal and emissive images. Bind the provided PBR sidecars explicitly.
const material = document.getRoot().listMaterials()[0]
if (!material) throw new Error("Car material missing")
const roughness = await sharp(
  await readFile(join(input, "textures/Mat_Robot_Roughness.png")),
)
  .extractChannel(0)
  .raw()
  .toBuffer({ resolveWithObject: true })
const metallic = await sharp(
  await readFile(join(input, "textures/Mat_Robot_Metallic.png")),
)
  .extractChannel(0)
  .raw()
  .toBuffer({ resolveWithObject: true })
if (
  roughness.info.width !== metallic.info.width ||
  roughness.info.height !== metallic.info.height
)
  throw new Error("Car PBR texture sizes differ")
const packed = Buffer.alloc(roughness.data.length * 3)
for (let i = 0; i < roughness.data.length; i++) {
  packed[i * 3] = 255
  packed[i * 3 + 1] = roughness.data[i]
  packed[i * 3 + 2] = metallic.data[i]
}
const image = await sharp(packed, {
  raw: { width: roughness.info.width, height: roughness.info.height, channels: 3 },
})
  .png()
  .toBuffer()
material
  .setMetallicRoughnessTexture(
    document
      .createTexture("Mat_Robot_MetallicRoughness")
      .setImage(image)
      .setMimeType("image/png"),
  )
  .setMetallicFactor(1)
  .setRoughnessFactor(1)
if (material.getEmissiveTexture()) material.setEmissiveFactor([1, 1, 1])
document.getRoot().setExtras({ attribution })
await io.write(join(output, "original.glb"), document)
console.log("Preparing WebP and KTX2 variants…")
const webp = await optimizeModel(join(output, "original.glb"), join(output, "webp.glb"), {
  textures: { format: "webp", maxSize: 2048, quality: 80 },
})
const ktx = await optimizeModel(join(output, "original.glb"), join(output, "ktx2.glb"), {
  textures: { format: "ktx2", codec: "uastc", maxSize: 2048 },
})
// The runtime inspector currently supports rigid geometry. Keep the original rig and clips in the variants above.
for (const node of document.getRoot().listNodes()) node.setSkin(null)
for (const mesh of document.getRoot().listMeshes())
  for (const primitive of mesh.listPrimitives())
    for (const semantic of primitive.listSemantics())
      if (/^(JOINTS|WEIGHTS)_/.test(semantic)) primitive.setAttribute(semantic, null)
for (const skin of document.getRoot().listSkins()) skin.dispose()
for (const animation of document.getRoot().listAnimations()) animation.dispose()
await io.write(join(output, "preview.glb"), document)
const validation = {
  original: await checkModel(join(output, "original.glb")),
  preview: await checkModel(join(output, "preview.glb")),
  textures: await checkModelTextures(join(output, "ktx2.glb")),
}
await writeFile(
  join(output, "report.json"),
  JSON.stringify({ attribution, conversion, webp, ktx, validation }, null, 2),
)
await writeFile(
  join(output, "ATTRIBUTION.md"),
  `Car model by [cuadot](${attribution.url}).\nUser-supplied FBX and PNG textures.\nDemo derivatives: normalized import, packed metallic/roughness map, WebP/KTX2 optimization, static reference geometry for the rigid viewer.\n`,
)
if (
  validation.original.issues.numErrors ||
  validation.preview.issues.numErrors ||
  !validation.textures.valid
)
  throw new Error("Car demo failed validation; see report.json")
const model = await serveModel(join(output, "preview.glb"), 5185, { attribution })
const textures = await serveTextureComparison(
  join(output, "original.glb"),
  join(output, "ktx2.glb"),
  { port: 5186, attribution },
)
const webpView = await serveTextureComparison(
  join(output, "original.glb"),
  join(output, "webp.glb"),
  { port: 5187, attribution },
)
console.log(
  JSON.stringify(
    { model: model.url, ktx2: textures.url, webp: webpView.url, output },
    null,
    2,
  ),
)
const close = () => {
  void Promise.all([model.close(), textures.close(), webpView.close()]).then(() =>
    process.exit(0),
  )
}
process.once("SIGINT", close)
process.once("SIGTERM", close)
