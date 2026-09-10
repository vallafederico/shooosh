# Agent entry guide: models, textures and rigs

For page mirroring, SVG sharpness or SDF/MSDF text, use the
[agent rendering workflow](./agent-dom-rendering.md). This page covers the
separate model/texture conversion and rig tools.

Read this before selecting an import or inventing a renderer integration.
These APIs require **shooosh 0.0.7+ and shooosh-model 0.1.0+**. Check the
installed package's `exports`, declarations and CLI `--help`. In a checkout, build core before the model tools:

```sh
pnpm install
bun run bin/build.ts
pnpm --filter shooosh-model build
node packages/model/dist/cli.js --help
```

The commands below use `shooosh-model`, the executable after installing a built
model package. In a checkout substitute `node packages/model/dist/cli.js`.
`shooosh-model` is a separate package, not `shooosh/model` or `shooosh/cli`.

## Choose the boundary

| Need | Entry / tool | Execution |
| --- | --- | --- |
| Draw a site canvas, item, rigid object | `shooosh`, or `/webgpu` / `/webgl2` | Browser |
| Inspect, validate, convert, edit, compress models | `shooosh-model/node` or CLI | Node 22+ |
| Inspect/convert/decode/compare textures | `shooosh-model/node` or `texture-*` CLI | Node; comparison UI is local |
| Generate typed controls for rigid model parts | `shooosh-model generate` | Node build step |
| Bind part operations to a custom adapter | `shooosh-model` (`bindModel`) | Dependency-free runtime |
| Load prepared rigid geometry with our renderer | `shooosh-model/shooosh` (`loadModel`) | Browser, explicit opt-in |
| Extract bones, inverse binds, TRS clips | `shooosh-model rig` / `prepareRig` | Node build step |
| Bone lookup, pose changes, clip sampling, sockets, palettes | `shooosh/rig` | Pure CPU, browser or Node |

No Node model/texture importer belongs in the browser graph. Do not add Three.js,
React Three Fiber, Assimp, Sharp, meshopt or native texture codecs to a site to
reproduce the CLI. Do not re-export `/rig` through core. Import only the selected
example source, not the catalog; examples are repository recipes, not npm APIs.

## Workflow: model to editable parts

```sh
shooosh-model convert asset.fbx --out asset.glb
shooosh-model inspect asset.glb > asset.inventory.json
shooosh-model check asset.glb
shooosh-model compress asset.glb --out asset.optimized.glb
shooosh-model check asset.optimized.glb
shooosh-model generate asset.optimized.glb --out Asset.ts --url /models/Asset.model.json
shooosh-model view asset.optimized.glb
```

Conversions accept FBX, OBJ, DAE, STL, PLY, 3DS, OFF and glTF/GLB. Sidecars must
stay inside the input/resource directory, including symlinks. Conversion is best
effort: inspect units, axes, hierarchy, materials, warnings and clips. Outputs
must use new paths. `compress` preserves geometry values with meshopt compression
and optimizes textures by default; `--textures off` preserves image bytes.

Deploy the generated `.model.json` and `.model.bin` together at the chosen URL.
Use the generated TypeScript loader and the exact keys it contains; IDs/keys refer
to this artifact, so regenerate after changing the source. The workbench can
export the corresponding operations instead of guessing names. For example:

```ts
import { loadModel } from "shooosh-model/shooosh"

const model = await loadModel(canvas, "/models/Asset.model.json")
const part = Object.values(model.nodes).find(node => node.available)
if (part) part.setVisible(false)
// On component removal:
model.destroy()
```

For material edits/transforms choose a rigid mesh from the inventory rather than
an arbitrary group. See the [model package reference](https://github.com/vallafederico/shooosh/blob/main/packages/model/README.md)
for exact patch shapes, generated interfaces, budgets and cancellation.

## Workflow: optimize and verify textures

```sh
shooosh-model texture-tools
shooosh-model texture-inspect original.png
shooosh-model texture-convert original.png --out converted.webp
shooosh-model texture-check converted.webp
shooosh-model texture-view original.png --compare converted.webp
shooosh-model texture-convert original.png --out converted.ktx2 --codec uastc
shooosh-model texture-check converted.ktx2
shooosh-model texture-view original.png --compare converted.ktx2
shooosh-model texture-transcode converted.ktx2 --out converted-bc7.ktx2 --target bc7
```

The official KTX executable is external: use `ktx` on PATH,
`SHOOOSH_KTX_BINARY`, or API `ktxPath`. Nothing auto-downloads it. PNG/JPEG/WebP
operations do not need it. BC/ETC/ASTC target support and source constraints are
listed in the model reference; conversion success is not a GPU-support guarantee.
Comparison views decode on Node and show original/converted/difference previews;
they do not prove native compressed-texture upload on every target GPU.

For a model pair, `texture-view original.glb --compare optimized.glb` compares
embedded images. Inspect image dimensions, color space, alpha, data-map channels,
size changes and preview quality. Normal/roughness/metallic maps are data, not
sRGB color images. Default optimization treats them conservatively. Do not call
conversion verified merely because a file was written.

## Workflow: imported rig to runtime bone references

```sh
shooosh-model rig asset.glb --out asset.rig.json
```

```ts
import { createRig, createRigAnimator, getSocketMatrix } from "shooosh/rig"
import type { RigDefinition } from "shooosh/rig"

const response = await fetch("/models/asset.rig.json")
if (!response.ok) throw new Error(`Rig: HTTP ${response.status}`)
const data: RigDefinition = await response.json()
const rig = createRig(data)
const animator = createRigAnimator(rig, data.clips ?? [])
if (animator.clips.length) animator.sample(0, 0.5, { loop: true })
const bone = rig.bones[0] // Prefer a specific inspected key for real interactions.
if (bone) {
  const socket = getSocketMatrix(rig, bone.key)
  // Read socket[12..14] for the model-space attachment position.
}
```

Use keys or indices when names are ambiguous; `findBones(name)` returns matches.
Local TRS edits are absolute, rotations are `[x,y,z,w]` quaternions, matrices are
column-major. Sampling has no internal clock and resets untargeted properties by
default. `writeSkinMatrices` provides a palette for a separate skinning renderer;
it does not deform geometry by itself. Read [rig.md](./rig.md) before mixing mesh,
model or world coordinate spaces.

## Pick an example and know its limits

| Example | What it demonstrates | Limit |
| --- | --- | --- |
| `rig-bones` | Built-in arm or imported car; bone selection, clip scrub, socket marker | Bones/poses only; no mesh deformation |
| `car-pbr` | Separately prepared static car, textures and PBR studio | Static pose, separate preparation; no rig playback |
| Model `view` command | Scene inventory and rigid-part edits; textured/solid toggle | Approximate base-color shading, not full glTF PBR |
| `texture-view` | Original/converted maps, channels, difference and mips | Node-decoded previews, not native GPU-format certification |

The rigid workbench omits skins/morph targets and does not play authored clips.
Its base-color preview does not render normal/emissive/data-map lighting or alpha
modes. Do not describe it as a full glTF renderer. Unsupported animation channels
appear in rig extraction warnings. For visible skinned animation a renderer must
consume joint/weight attributes and the palette; that integration is not supplied.

Copy sets and asset preparation:
[example guide](https://github.com/vallafederico/shooosh/blob/main/examples/agent-guide.md),
[rig example](https://github.com/vallafederico/shooosh/blob/main/examples/rig-bones.md),
[car studio](https://github.com/vallafederico/shooosh/blob/main/examples/car-pbr.md).
Use the source checkout/tag matching the installed API. Local car assets are not
redistributed; preserve the supplied [cuadot attribution](https://sketchfab.com/cuadot).

## Verification and distribution

For a site integration, verify pixels, interaction, failure behavior and cleanup
on forced WebGPU/WebGL2. For CLI output, inspect/check the result and review the
before/after texture views. For package changes, run `bun test package`,
`bun run bin/build.ts`, the model build and its `test:boundary` script.
The [bundle audit](./audits/2026-09-09-final-tree-shaking.md) records zero growth in
existing core bundles; optional imports cost bytes when used. npm installation
size and the full example gallery are different measurements.

Core tarballs include `llms.txt`, `agents.md` and `docs/`; the model tarball includes
its own `llms.txt`, `agents.md` and reference README. Examples/skills/source and
private demo assets require the repository. These files prepare the next release;
a workspace change does not publish to npm or deploy hosted docs.
