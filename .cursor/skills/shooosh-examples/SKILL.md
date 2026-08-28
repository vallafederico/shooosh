---
name: shooosh-examples
description: Copy a shooosh example that uses the library for a common shader look. Use when the user wants a site-GPU look or a Webflow/SSR shell.
---

# Copy an example

Open [`examples/README.md`](../../../examples/README.md), pick a row, copy that file. Prefer a **file that imports shooosh** — shaders and recipes live in examples, not package presets.

Shared sources (edit these; do not invent package builtins):

- `examples/post-shaders.ts` — bloom / FXAA / grain `applyEffect` (GLSL + WGSL)
- `examples/pbr-shaders.ts` — Cook–Torrance for `createObject`
- `examples/fluid-sim.ts` + `fluid-shaders.ts` — WebGPU fluids on `createCompute`
- `examples/make-texture.ts` — procedural canvases (`flipY: false` for env/matcap)
- `examples/make-sdf.ts` — browser EDT demos (production: `shooosh/msdf`)

Mount-only (Webflow, bake, React/Solid): [`examples/setups/`](../../../examples/setups/README.md).

## Always

- Author WGSL `fn fsMain`. `value1` = seconds. Pointer UV = `value2`/`value3` (top-origin). `createMouseMonad` is −1..1 — remap with `m.x * 0.5 + 0.5`.
- Textures: `textureSample(uTexture, uSampler, fitUv(vUv))`. Env maps: `loadTexture(src, { flipY: false })`.
- Stay in the converter subset so WebGL2 can run it (`docs/shader-translation.md`).
- Post uses `applyEffect`, not `fsMain` — `createPostProcessor().addFragmentEffect({ fragmentShader, fragmentShaderWgsl })`. No named package bloom/bw/noise.
- Fluids: `createCompute(engine)` then example `createFluidSim` + shaders. Not a package fluid API.
- Do not import `shooosh/msdf` from the site bundle.
