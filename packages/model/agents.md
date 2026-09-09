# Using shooosh-model as an agent

Start with [llms.txt](./llms.txt), then the [reference](./README.md). This is an
experimental workspace package. It has not been published; after installing a
built package, `shooosh-model --help` lists its commands. In the source checkout,
build core and then this package; use `node packages/model/dist/cli.js` from the
repo root in place of `shooosh-model`.

## Select the entry

| Entry | Purpose |
| --- | --- |
| `shooosh-model/node` | Node-only inspect/check, convert/edit/compress, texture tools, preparation/generation and local viewers |
| `shooosh-model` | Pure controller contract (`bindModel`) for your own adapter |
| `shooosh-model/shooosh` | Browser loader for prepared rigid geometry (`loadModel`) |
| `shooosh/rig` | Separate core subpath for bones, local/world poses, explicit-time TRS sampling, skin palettes and sockets |

Do not import Node processing into a browser bundle, introduce Three.js, or
re-export optional rig/model tools from core. Convert assets before deployment.
Use named ESM imports. Examples and generated models are not package presets.

## Model workflow

```sh
shooosh-model convert source.fbx --out source.glb
shooosh-model inspect source.glb > source.inventory.json
shooosh-model check source.glb
shooosh-model compress source.glb --out optimized.glb
shooosh-model check optimized.glb
shooosh-model generate optimized.glb --out Product.ts --url /models/Product.model.json
shooosh-model view optimized.glb
shooosh-model rig source.glb --out Product.rig.json
```

Deploy generated metadata and binary together. Use exact generated keys and
regenerate after source edits. All output paths must be new; local resource paths
and symlinks must remain within the declared resource directory. Preserve model
attribution. Review import warnings and validate units, axes, hierarchy and clips.

Texture verification:

```sh
shooosh-model texture-tools
shooosh-model texture-convert original.png --out converted.webp
shooosh-model texture-check converted.webp
shooosh-model texture-view original.png --compare converted.webp
shooosh-model texture-convert original.png --out converted.ktx2 --codec uastc
shooosh-model texture-check converted.ktx2
shooosh-model texture-view original.png --compare converted.ktx2
```

KTX operations need external KTX-Software (PATH, `SHOOOSH_KTX_BINARY` or API
`ktxPath`); WebP/PNG/JPEG do not. Treat color and data maps differently. Check alpha,
channels, dimensions, file sizes and visual differences. A Node-decoded preview
is not proof of native compressed-texture support on a target GPU.

## Keep capability claims exact

The model workbench renders rigid triangles and approximate base-color textures;
it omits skinned/morph geometry and does not play clips. Normal/emissive/data maps,
alpha modes and authored lighting are not fully rendered there. The separate car
PBR studio is a static example, not rigged playback.

Rig extraction preserves node/skin links, inverse binds and TRS tracks; unsupported
channels produce warnings. `createRigAnimator` samples explicit times without a
clock. Bone references/skin matrices do not deform a mesh automatically. Import
`shooosh/rig` separately and read its guide for absolute local TRS, quaternion and
matrix conventions. Bone names may repeat; prefer generated keys or indices.

Always handle loading failure, retain readable HTML and destroy browser handles.
Use a fresh canvas when switching renderer backends. Verify pixels, edits,
cleanup and remounting on both WebGPU and WebGL2. The README describes the actual
budgets and format/renderer limits; do not infer support from inventory alone.
