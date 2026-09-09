# shooosh-model

A separate, experimental workspace package for understanding glTF assets and
controlling their parts with shooosh. No React or Three.js. The shooosh browser
entry is unchanged; Node processing and the optional workbench live here.

Agent discovery: [llms.txt](./llms.txt) → [agents.md](./agents.md) → this reference. Both indexes are included when this package is packed.

## Build and try

From the repository root, using Node 22+ and the workspace dependencies:

```sh
pnpm install
bun run bin/build.ts
pnpm --filter shooosh-model build
node packages/model/dist/cli.js inspect /path/to/Product.glb
node packages/model/dist/cli.js view /path/to/Product.glb
```

`view` prints a local URL. Open it to orbit/zoom, select meshes in 3D or search the
scene tree, hide/isolate parts, apply local transforms, change solid material
properties, and download the corresponding runtime operations. The workbench
runs on WebGPU with WebGL2 fallback and keyboard-accessible transform controls.
It serves only this prepared model and bundled assets on `127.0.0.1`; it does
not upload files, browse the filesystem, or overwrite the source model.

This package has not been published to npm. After packaging/installing it,
`shooosh-model` is the equivalent executable. Build before packing.

## Node commands

```sh
shooosh-model inspect Product.glb > Product.inventory.json
shooosh-model check Product.glb
shooosh-model edit Product.glb --patch edits.json --out Product-edited.glb
shooosh-model compress Product-edited.glb --out Product-small.glb
shooosh-model generate Product-small.glb --out Product.ts --url /models/Product.model.json
shooosh-model view Product-small.glb --port 5182
```

- `inspect`: metadata-only JSON inventory, without decoding geometry or textures.
  Includes hierarchy, names and IDs, instances, primitive counts, local accessor
  bounds, materials, images, skins, cameras, animation targets/durations, extras
  and root extensions (including authored lights). Triangle counts distinguish
  unique mesh geometry from its node instances; they are not measured draw calls.
- `check`: Khronos glTF Validator report. Exits with status 1 on validation errors.
  Checks local resources; network loading is disabled. Validator extension
  coverage may be narrower than the processing library's coverage.
- `edit`: names and local TRS, plus material color/metallic/roughness. Node material
  edits clone the mesh/material so other instances retain their appearance.
  Material-ID edits intentionally affect all users of that material. The full
  patch is checked before changes are applied.
- `compress`: meshopt buffer compression without quantization, simplification,
  joining, or pruning. Preserves vertex values and triangle winding; the codec
  may cyclically rotate each triangle's index order. Texture optimization runs by
  default; use `--textures off` for geometry-only compression. Small models can grow; the command reports actual input/output
  bytes and makes no reduction guarantee. Output requires meshopt decoding.
- `generate`: a typed TypeScript loader plus `.model.json` metadata and a shared
  `.model.bin` containing decoded rigid geometry. Run it on your final edited/
  compressed source. The browser does not need glTF Transform or meshopt.

Every output must be a new path; the CLI refuses overwrite. `.gltf` inputs with
local resources are supported, and edited/compressed output is self-contained
`.glb`. Unknown extensions are inspectable but block rewriting so they are not
silently dropped. Known extensions use glTF Transform's registered handlers.
Resource paths, including symlinks, must stay inside the model directory.
High-level processing rejects JSON above 64 MiB and estimated decoded accessors
above 512 MiB. For trusted larger geometry, `openModel(path, { maxDecodedBytes })`
can raise the accessor budget; this estimate is not a total memory cap.

Example `edits.json` (IDs come from `inspect` on this exact input):

```json
{
  "nodes": [
    { "id": 1, "name": "Door", "translation": [0.1, 0, 0] },
    { "id": 3, "material": { "color": [0.8, 0.1, 0.05, 1], "roughness": 0.35 } }
  ],
  "materials": [{ "id": 0, "metallic": 0.7 }]
}
```

Node rotations are unit quaternions `[x, y, z, w]`; translation and scale replace
local glTF values. Material colors are linear RGBA in `[0,1]`. The lower-level
`openModel()` returns glTF Transform's `document` and `io` for custom operations.

```ts
import { inspectModel, editModel, checkModel } from "shooosh-model/node"
const inventory = await inspectModel("./Product.glb")
await editModel("./Product.glb", "./Product-red.glb", {
  nodes: [{ id: 3, material: { color: [1, 0, 0, 1] } }],
})
const validation = await checkModel("./Product-red.glb")
```

## Runtime interface

Copy the generated `Product.ts` into your application and its sibling
`Product.model.json` / `Product.model.bin` into `/public/models`. Preserve the
binary filename referenced by the JSON. Import the generated loader directly:

```ts
import { load } from "./Product"

const model = await load(canvas, "/models/Product.model.json", { backend: "auto" })
model.nodes.Door__1.setTransform({ rotation: [0, Math.PI / 3, 0] })
model.nodes.Door__1.setMaterial({ color: [0.8, 0.1, 0.05, 1], roughness: 0.25 })
model.nodes.Door__1.useMaterial("Enamel__0")
model.nodes.Door__1.setVisible(false)
model.isolate("Door__1")
model.reset()

const unsubscribe = model.on("open-door", () => {
  model.nodes.Door__1.setTransform({ rotation: [0, Math.PI / 3, 0] })
})
button.onclick = () => model.trigger("open-door")
// On teardown: unsubscribe(); model.destroy()
```

The names above are illustrative: use the exact generated keys for your asset.
Keys include the original node index, so duplicate names, empty names and names
that are not JavaScript identifiers are unambiguous. Indices apply to one source
artifact; regenerate after modifying it. The generated loader checks its source
fingerprint and the binary's hash before mounting.

`setTransform` applies a **local offset from the imported pose**: position,
Euler rotation in radians (`Rz × Ry × Rx`), and nonzero scale multipliers.
Local matrix = imported matrix × offset matrix. Ancestor transforms propagate
to children; normals use the inverse transpose. A material edit targets that
node's own mesh primitives; a group transform or visibility change affects its
subtree. `setVisible(true)` does not override a hidden ancestor. `reset()` restores
all part edits; `setView()` controls the whole preview's rotation/zoom separately.

`model.pick(u, v)` returns a node ID at top-origin canvas UV; `model.select(id)`
highlights it. Custom action triggers are application callbacks, not authored
animation clips. `model.animations` lists clip handles, but `play()` throws an
explicit unsupported-operation error in the current shooosh adapter.

`loadModel(canvas, preparedUrl, options)` is also available directly from
`shooosh-model/shooosh`. It owns its scene and requires a sized canvas. It accepts
an AbortSignal for loading and disposal, and a scene index. Keep semantic HTML
visible when loading fails. Use a fresh canvas when switching backend types.
The adapter follows shooosh's current default-engine ownership: mount one model
canvas at a time. It refuses edits when a different engine becomes active.

The root `shooosh-model` export is a zero-dependency controller contract
(`bindModel`, `ModelAdapter`) for custom integrations. The `/node` export contains
all filesystem, validation and decoding dependencies; `/shooosh` adds only
shooosh rendering. The workbench uses that same adapter.

## Current rendering and performance limits

- Renders rigid triangle meshes, preserving source hierarchy and static matrices.
  Supports solid base colors and approximate metallic/roughness shading.
  The CLI workbench opens in **Textured** mode, with a **Solid colors** toggle.
  Base-color PNG/JPEG/WebP/KTX2 images are decoded on Node into PNG previews
  (maximum 2048 pixels per dimension, 16 million pixels total). KTX2 uses the
  existing decoder/tool setup. UVs remain attached through transforms and
  material reassignment; color edits tint the texture. Source images are unchanged.
  `prepareModel(input, { textures: true })` includes these previews in its binary;
  default preparation/generated site assets remain geometry-only.
- Textured preview supports TEXCOORD_0 and repeat/mirror/clamp wrapping.
  Other UV sets and KHR_texture_transform fall back to solid color with a notice.
  Reports but does not render normal/emissive/metallic-roughness maps, alpha modes, glTF material extensions,
  authored lights/cameras, skins, morph targets or animation playback. Skinned
  nodes and morph-target primitives are omitted with a visible support notice.
  A model containing only those features may have no visible geometry.
- This is an inspection/control foundation, not a full glTF PBR renderer. The
  original source retains those features through the Node processing workflow.
- Missing normals are generated as flat triangle normals, splitting vertices at
  triangle boundaries. Geometry is shared in the prepared binary, but each visible node instance has
  its own GPU buffers/draws. Per-part transform edits bake only affected subtrees
  and recreate their geometry; use for occasional edits and interactions, not
  per-frame skeletal animation. Material edits and whole-view orbit update
  uniforms/transforms without rebuilding geometry. Isolation batches visibility.
- Defaults: 1,024 primitive draws and 5 million instanced vertices. Exceeding a
  budget stops preview with a readable message; direct runtime callers may raise
  `maxDraws` / `maxVertices` explicitly. The scene tree paginates at 100 results.
  Picking checks triangles on click, not each frame; there is no BVH yet.
- `inspect` reads only the GLB JSON chunk (up to 64 MiB). `.gltf` JSON is read as a
  whole. Editing, validation, preparation and compression decode/load the full
  asset and need memory accordingly. Prepared runtime geometry is uncompressed;
  apply HTTP transport compression when serving it. Texture processing is sequential;
  progressive/streamed loading is future work.
- Workbench edits are temporary. The download is a runtime operations script;
  use the Node `edit` API/CLI when you want a new glTF artifact on disk.

## Verification

```sh
pnpm --filter shooosh-model build
pnpm --filter shooosh-model check
pnpm --filter shooosh-model test
bun packages/model/test/fixture.ts /tmp/model-demo.glb
node packages/model/dist/cli.js view /tmp/model-demo.glb
```

The fixture is authored here and contains hierarchy, shared geometry/materials,
duplicate names, nonuniform scale and an animation channel. Tests cover validation,
non-destructive edits, compression round trips, generation, controller lifecycle
and matrix/normal math. Manually check WebGPU and WebGL2 in the workbench.

## Import other model formats

Convert assets to a self-contained GLB, then use the same inspection, editing,
compression, workbench and generated runtime controls:

```sh
node packages/model/dist/cli.js convert building.fbx --out building.glb
node packages/model/dist/cli.js convert assembly.obj --resources ./textures --out assembly.glb
node packages/model/dist/cli.js view building.glb
node packages/model/dist/cli.js generate building.glb --out Building.ts
```

```ts
import { convertModel, importFormats } from "shooosh-model/node"

const report = await convertModel("building.fbx", "building.glb", {
  timeoutMs: 120_000,
  signal: AbortSignal.timeout(120_000),
  // resourceDirectory: "./assets", // default: source directory
})
console.log(report.validation, report.warnings)
```

Accepted inputs: FBX, OBJ, Collada (`.dae`), STL, PLY, 3DS, OFF and glTF/GLB.
FBX and other interchange formats use Assimp WASM in a disposable Node worker;
glTF inputs use glTF Transform. No Three.js, Blender installation or external
converter executable is required. Conversion code stays outside browser bundles.
The worker is terminated after completion, cancellation or timeout (120 seconds
by default). Cancellation also kills active KTX encoding processes and removes
the job's scratch files. Conversion still decodes the full asset in memory; this is not a
streaming importer and very large assets may exceed WASM memory limits.

Keep source material libraries and image files available at their referenced
paths. `resourceDirectory` changes the base for relative sidecar paths; it does
not search recursively or repair stale absolute paths. References and symlinks
must stay inside that directory. Images are embedded in
the GLB; missing referenced images and OBJ material libraries fail conversion.
Every result passes Khronos validation before writing, and existing output
files are never overwritten. Review both converter warnings and validation
messages in the returned report.

Conversion is best effort, not a native-application round trip. Check units,
axes, part names, hierarchy, material appearance and animation against the
source. Formats like STL have no scene/material information to retain. FBX
procedural materials, constraints and application-specific features may not
survive; animation baking is not provided. Native
Blender, USD and CAD formats are not accepted by this initial API. The workbench
and runtime still have the rendering limits documented above, even when the
converted GLB contains textures or animation.

## Optimize textures

Texture optimization runs by default in `convertModel`, `compressModel` and its
alias `optimizeModel`, and in the matching `convert`, `compress`, `optimize` CLI
commands. Defaults: color maps capped at 2048 pixels on their longest edge,
aspect ratio preserved, no upscaling, original PNG/JPEG/WebP format retained,
JPEG/WebP quality 85. Resizing and JPEG/WebP encoding can be lossy. PNG encoding
uses full-color lossless compression. Without resizing, an encoding is kept
only when smaller than the original. Output format is therefore a preference;
check the report for the actual result.

```ts
import { convertModel, optimizeModel } from "shooosh-model/node"

const textures = { maxSize: 1024, format: "webp" as const, quality: 80 }
await convertModel("building.fbx", "building.glb", { textures })
const report = await optimizeModel("building.glb", "building-small.glb", { textures })
console.log(report.textures) // total image bytes and per-image dimensions/notes
```

```sh
shooosh-model optimize building.glb --out building-small.glb \
  --texture-size 1024 --texture-format webp --texture-quality 80
shooosh-model convert building.fbx --out building.glb --textures off
```

Use `textures: false` to preserve original image bytes, or call
`optimizeTextures(document, options)` on an open glTF Transform document.
Shared images are processed once; UVs, samplers and material bindings remain.
Alpha is retained; a JPEG request uses PNG for images with an alpha channel.
Normal, occlusion, metallic/roughness, unknown extension slots and images shared
between color/data slots retain their dimensions. Their unprofiled 8-bit PNGs
receive only lossless recompression; other data-map encodings are retained.
High bit-depth and animated images are retained. Unsupported encodings,
are reported and left unchanged. Existing KTX2 is retained in auto mode; explicit format requests can decode or encode it. Corrupt images
fail the operation before output is written.

WebP output declares required `EXT_texture_webp`; consuming renderers must support
that extension. WebP reduces storage/download bytes but remains uncompressed on the GPU. KTX2/Basis conversion is available explicitly as described below. The model workbench previews solid materials; the separate texture lab compares decoded images, including alpha and data channels.
See the [WebP extension specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_texture_webp/README.md)
and [Sharp output options](https://sharp.pixelplumbing.com/api-output/).

## KTX2, GPU formats and conversion verification

The Node API provides `inspectTexture`, `checkTexture`, `convertTexture`,
`transcodeTexture`, `decodeTexture`, `compareTextures`, `checkModelTextures`, and
`serveTextureComparison`. Texture tools work on individual files; model texture
checking and the comparison server also support `.glb` / `.gltf` model pairs.

```ts
import {
  convertTexture,
  checkTexture,
  transcodeTexture,
  compareTextures,
  serveTextureComparison,
  optimizeModel,
} from "shooosh-model/node"

await convertTexture("paint.png", "paint.ktx2", {
  codec: "uastc", // or etc1s
  colorSpace: "srgb", // use linear for data maps
  mipmaps: true,
  gltfCompatible: true,
})
console.log(await checkTexture("paint.ktx2", { gltf: true }))
await transcodeTexture("paint.ktx2", "paint-bc7.ktx2", "bc7")
await convertTexture("paint-bc7.ktx2", "paint-preview.webp", { quality: 90 })
const { report, atlas } = await compareTextures("paint.png", "paint-bc7.ktx2")
console.log(report) // validation, dimensions, levels, encoded bytes, RGBA errors
const viewer = await serveTextureComparison("paint.png", "paint-bc7.ktx2")
console.log(viewer.url) // call viewer.close() when finished

await optimizeModel("building.glb", "building-ktx.glb", {
  textures: { format: "ktx2", codec: "uastc", mipmaps: true, maxSize: 2048 },
})
```

```sh
shooosh-model texture-tools
shooosh-model texture-inspect paint.ktx2
shooosh-model texture-check paint.ktx2
shooosh-model texture-check building-ktx.glb
shooosh-model texture-convert paint.png --out paint.ktx2 --codec etc1s --quality 75
shooosh-model texture-transcode paint.ktx2 --out paint-bc7.ktx2 --target bc7
shooosh-model texture-view paint.png --compare paint-bc7.ktx2
shooosh-model texture-view original.glb --compare building-ktx.glb
shooosh-model texture-view paint.png --compare paint.ktx2 --level 2
shooosh-model optimize building.glb --out building-ktx.glb --texture-format ktx2 --codec uastc
```

`texture-convert` also accepts `--size`, `--color-space linear|srgb`, and
`--mipmaps on|off`. KTX quality maps to ETC1S quality; UASTC uses encoder level 2
and Zstd level 9. Both are lossy. The model pipeline declares required
`KHR_texture_basisu`; its color images are aligned to multiples of four for glTF
compatibility (possibly adjusting aspect slightly). Data maps use linear UASTC,
retain their dimensions, and disable mip generation to avoid averaging packed
channels or normals incorrectly. Data-map dimensions not divisible by four
require an explicit preprocessing resize. Standalone KTX2 need not satisfy the
glTF restrictions unless `gltfCompatible: true` is selected.

GPU transcode targets are `bc1`, `bc3`, `bc4`, `bc5`, `bc7`, `etc-rgb`,
`etc-rgba`, `eac-r11`, `eac-rg11`, `astc` and `rgba8`. Output is a KTX2 container
with native-format blocks, not a DDS or raw `.astc` file. Supported native LDR
blocks can be decoded back to PNG/WebP: BC1/3/4/5/7, ETC2 RGB/RGBA, EAC R/RG and
ASTC 4×4. Unsupported codec/target combinations fail explicitly. Native GPU
preview decoding is limited to 16 million pixels per mip. HDR, arbitrary ASTC
block sizes, cubemaps, arrays, volumes, DDS and bare `.basis` files are outside
this initial conversion/preview API. Inspection and Khronos validation can still
report container information beyond the preview subset.

The texture lab displays decoded original/converted images through shooosh on
WebGPU or WebGL2. It includes a wipe, original/converted modes, RGB difference
amplified 4×, alpha/R/G/B channels, zoom/pan, and validation/size/error reports.
Model images are paired by texture index, with names displayed; this matches our
conversion pipeline, not arbitrary exporters that reorder images. Missing or
unsupported images appear as individual errors instead of blocking other pairs.

The original preview is capped at 1024 pixels by default (`previewSize`, up to
4096). The converted image is resampled with nearest-neighbor to the original
preview size, exposing resizing losses. RGBA RMSE/PSNR are computed at that
preview resolution; they are sample-error metrics, not perceptual scores.
`psnrDb: null` means an exact match. Difference RGB does not display alpha error;
use the alpha channel to inspect transparency. Decoded previews do **not** verify
native compressed uploads or support on a particular GPU. The shooosh engine's
compressed texture upload API is unchanged. Image decoding still loads each full
source image before the preview cap; model comparison prepares images sequentially
and retains the preview atlases in memory for the local server.

### KTX tool setup

Encoding, full KTX validation, extraction and transcoding use the official
[Khronos KTX-Software tools](https://github.com/KhronosGroup/KTX-Software/releases),
tested with **4.4.2**. They are external Node tooling, not a browser dependency.
Install KTX-Software 4.4+ and expose `ktx` on PATH, set `SHOOOSH_KTX_BINARY` to its
executable, or pass `ktxPath` in API options. A user-local installation at
`~/.local/share/shooosh-model/ktx/bin/ktx` is also detected. No executable is
bundled or downloaded automatically. `texture-tools` reports availability.
PNG/JPEG/WebP utilities do not require KTX tools. Native block decoding uses
`texture2ddecoder-wasm` only in Node; no Three.js or alternate rendering engine.

KTX processes use argument arrays without a shell, a 120-second default timeout,
and support API cancellation via `signal`. Outputs must be new files; temporary
conversion files are cleaned up. KTX tests run when the tool is available and
are explicitly skipped otherwise. Generate a fresh diagnostic comparison fixture
with `node packages/model/test/texture-demo.mjs /tmp/my-texture-demo`, then use
`texture-view` on its `original.glb` and `converted.glb`.

## Optional rigs and bone references

`shooosh-model rig character.glb --out character.rig.json` extracts the bone
hierarchy, mesh/skin links, inverse binds and TRS animation tracks. The Node API
provides `prepareRig(input)` and `generateRig(input, output)`. Convert FBX and other
formats to GLB first. Source files are preserved and outputs cannot overwrite.

Use the artifact with the separate `shooosh/rig` entry: `createRig`,
`createRigAnimator`, `writeSkinMatrices` and `getSocketMatrix`. None is imported
by the core renderer, model controller or rigid workbench. See the
[rig guide](https://github.com/vallafederico/shooosh/blob/main/docs/rig.md) for keys, coordinate spaces and sampling semantics.
The utilities provide pose data; they do not enable skinned rendering in the
current workbench. Unsupported morph/extension channels appear in extraction
warnings.
