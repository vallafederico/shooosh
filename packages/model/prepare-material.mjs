import { readFile, writeFile } from "node:fs/promises"
import { compileShader } from "shooosh/compiler"
const shader = compileShader(
  await readFile(new URL("./src/material.wgsl", import.meta.url), "utf8"),
  { includeNormal: true },
)
await writeFile(
  new URL("./src/material.ts", import.meta.url),
  "// Generated from material.wgsl by prepare-material.mjs.\nexport default " +
    JSON.stringify(shader) +
    ";\n",
)
const preview = compileShader(
  await readFile(new URL("./src/texture-preview.wgsl", import.meta.url), "utf8"),
)
await writeFile(
  new URL("./src/texture-preview.ts", import.meta.url),
  "// Generated from texture-preview.wgsl\nexport default " +
    JSON.stringify(preview) +
    ";\n",
)

const textured = compileShader(
  await readFile(new URL("./src/textured-material.wgsl", import.meta.url), "utf8"),
  { includeNormal: true },
)
await writeFile(
  new URL("./src/textured-material.ts", import.meta.url),
  "// Generated from textured-material.wgsl\nexport default " +
    JSON.stringify(textured) +
    ";\n",
)
