import { build } from "esbuild"
import { mkdir, copyFile, chmod } from "node:fs/promises"
await mkdir(new URL("./dist/viewer/", import.meta.url), { recursive: true })
await build({
  entryPoints: ["viewer/viewer.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/viewer/viewer.js",
  minify: true,
  metafile: true,
}).then(async (result) => {
  const forbidden = Object.keys(result.metafile.inputs).filter((p) =>
    /texture2ddecoder|sharp|assimp|three|gltf-transform|draco|meshopt|node:/.test(p),
  )
  if (forbidden.length)
    throw new Error("Node processing leaked into viewer: " + forbidden.join(", "))
})
for (const file of ["viewer.html", "viewer.css"])
  await copyFile(`viewer/${file}`, `dist/viewer/${file}`)
await chmod("dist/cli.js", 0o755)
const textureBundle = await build({
  entryPoints: ["viewer/texture-viewer.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/viewer/texture-viewer.js",
  minify: true,
  metafile: true,
})
if (
  Object.keys(textureBundle.metafile.inputs).some((path) =>
    /texture2ddecoder|sharp|assimp|three|gltf-transform|node:/.test(path),
  )
)
  throw new Error("Node dependency leaked into texture viewer")
for (const file of ["texture-viewer.html", "texture-viewer.css"])
  await copyFile(`viewer/${file}`, `dist/viewer/${file}`)
