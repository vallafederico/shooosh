---
name: shooosh-examples
description: Copy a shooosh example that uses the library for a common shader look. Use when the user wants a site-GPU look or a Webflow/SSR shell.
---

# Copy an example

Open [`examples/README.md`](../../../examples/README.md), then read the [copy guide](../../../examples/agent-guide.md). Pick a row and copy its listed helpers as well as the demo. Prefer a **file that imports shooosh** — shaders and recipes live in examples, not package presets.

Shared sources (edit these; do not invent package builtins):

- `examples/post-shaders.ts` — bloom / FXAA / grain `applyEffect` (GLSL + WGSL)
- `examples/pbr-shaders.ts` — Cook–Torrance for `createObject`
- `examples/fluid-sim.ts` + `fluid-shaders.ts` — WebGPU fluids on `createCompute`
- `examples/make-texture.ts` — procedural canvases (`flipY: false` for env/matcap)
- `examples/make-sdf.ts` — browser EDT demos (production: `shooosh/msdf`)

Mount-only (Webflow, bake, React/Solid): [`examples/setups/`](../../../examples/setups/README.md).

## Always

- Author WGSL `fn fsMain`. Read the selected example’s uniform mapping; `value1` is usually seconds but DOM mix, post, MSDF and glass differ. Pointer UV is usually `value2`/`value3` (top-origin). `createMouseMonad` is −1..1 — remap with `m.x * 0.5 + 0.5`.
- Textures: `textureSample(uTexture, uSampler, fitUv(vUv))`. Env maps: `loadTexture(src, { flipY: false })`.
- Stay in the converter subset so WebGL2 can run it (`docs/shader-translation.md`).
- Post uses `applyEffect`, not `fsMain` — `createPostProcessor().addFragmentEffect({ fragmentShader, fragmentShaderWgsl })`. No named package bloom/bw/noise.
- Fluids: `createCompute(engine)` then example `createFluidSim` + shaders. Not a package fluid API.
- Do not import `shooosh/msdf` from the site bundle.

- Import a selected example directly, not the whole catalog. Examples are repository files, not npm subpath exports.
- Match the mount target and data selectors in the copy guide; provide nonzero CSS dimensions.
- Mount in a client lifecycle, handle `ready` rejection/null, and call `destroy()` on removal. Keep semantic HTML readable if GPU initialization fails.
- Fluids simulate only on WebGPU; WebGL2 shows clear color. A resolved backend does not prove the requested effect rendered.
- The DOM input mirror is a source-only prototype using internal imports; use documented `shooosh/dom` APIs for npm applications.
- Verify pixels and interaction on both forced backends, resize, cleanup and remount. Record unsupported behavior instead of claiming parity.
