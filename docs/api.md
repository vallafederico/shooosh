# Public API

[Documentation](./README.md)

Source of truth: [`package/index.ts`](../package/index.ts). This page is the human/agent summary after the WebGPU renderer.

## Choose a path

| Need | Call |
| --- | --- |
| Fullscreen fragment on its own canvas | `createScene(canvas, { screen })` |
| Page-behind canvas + DOM quads | `await acquireLayer()` then `createItem(el, …)` |
| WebGPU compute sim | `createCompute(engine)` — recipes (fluids, …) live in [`examples/`](../examples/README.md) |
| Post (bloom / grain / custom) | `createPostProcessor()` + example shaders (`fragmentShader` + `fragmentShaderWgsl`) |
| Which GPU am I on? | `await probeRenderer()` or `engine.backend` |
| Force a backend | `{ backend: "webgpu" \| "webgl2" }` — only that module graph; omit/`auto` picks best |

`acquireLayer()` / `probeRenderer()` / `createCompute()` return `null` when unavailable. Leave the page readable.

Site recipes (app-shell canvas, SSR init, Webflow, particles, MSDF): [site-patterns.md](./site-patterns.md). Library examples: [examples/](../examples/README.md). Bake font/icon atlases: [msdf.md](./msdf.md).

## Engine

```ts
const kind = await probeRenderer() // "webgpu" | "webgl2" | null

const engine = await createEngine(canvas, {
  backend: "auto", // default
  dpr: { max: 2 },
  clearColor: { r: 0, g: 0, b: 0, a: 0 },
})

engine.backend // "webgpu" | "webgl2"
engine.onRender((frame) => {
  frame.canvas
  frame.now
  frame.delta
  frame.backend
  // frame.gl is set only on WebGL2 — site code must not require it
})
```

`createEngine` and `acquireLayer` are **async**. `initEngine` sets the default engine used by `createScreen` / `createItem`.

**Backend import policy:** omit / `"auto"` probes WebGPU then WebGL2 (both chunks may load). `"webgpu"` / `"webgl2"` load only that stack and fail if unavailable (no silent fallback when forced).

Settle window: the loop stays hot for 250ms after the last dirty mark (scroll, pointer, `setUni`, `setTransform`, `requestFrame`).

## Scene / layer / item

```ts
const scene = createScene(canvas, {
  backend: "auto",
  screen: {
    shaders: { fragment: wgsl },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  },
})

const engine = await acquireLayer({ backend: "auto" })
if (!engine) return
const item = createItem(element, { shaders: { fragment: wgsl } })
// teardown:
item.destroy()
releaseLayer()
```

Scroll-tracked planes: see [`examples/scroll-cards.ts`](../examples/scroll-cards.ts) and [`examples/scroll-sections.ts`](../examples/scroll-sections.ts).

## Shaders

Author WGSL `fn fsMain`. See [shader-contract.md](./shader-contract.md).

```ts
convertWgslFragmentToGlsl(wgsl, { includeUv: true }) // WebGL fallback
convertGlslFragmentToWgsl(glsl)                     // port an escape-hatch shader
```

`#version 300 es` still compiles on WebGL2 only.

## WebGPU compute

```ts
const gpu = createCompute(engine) // null on WebGL2
if (!gpu) return

const pipe = gpu.createPipeline(wgsl, "pass")
const fields = gpu.createPingPong(w, h, "vel")
gpu.setOnCompute(({ encoder }) => {
  gpu.dispatch(encoder, pipe, w, h, [
    { binding: 0, resource: fields.readView },
    { binding: 1, resource: fields.writeView },
  ])
  fields.swap()
})
gpu.setOnDisplay(({ pass }) => { /* optional blit */ })
```

Helpers: `createPipeline`, `createDisplayPipeline`, `createPingPong`, `createStorageTexture`, `createUniformBuffer`, `writeBuffer`, `dispatch`, `requestFrame`, `destroy`.

**Fluids are not a package API.** Copy [`examples/fluid-sim.ts`](../examples/fluid-sim.ts) (pass loop) + [`examples/fluid-shaders.ts`](../examples/fluid-shaders.ts) (WGSL) and edit those. Demos: [`fluid-pointer`](../examples/fluid-pointer.ts), [`fluid-ambient`](../examples/fluid-ambient.ts).

## Post

Prefer `createPostProcessor().addFragmentEffect` with **author-owned** GLSL + WGSL from [`examples/post-shaders.ts`](../examples/post-shaders.ts) (bloom, FXAA, grain). There are **no** named package presets (`addBloomEffect` removed). Demo: [`grain-bloom`](../examples/grain-bloom.ts). Skill: `shooosh-post`.

`effects.custom({ fragmentShader, fragmentShaderWgsl })` + `createScene({ post })` remains thin sugar for the same snippets.

## Backend notes

The whole public API runs on both backends. Where they differ:

- `#version 300 es` fragments are a WebGL2 escape hatch. On WebGPU they are ignored with a warning and the default WGSL fragment is used, so author WGSL (or convert with `convertGlslFragmentToWgsl`).
- Post effects need `fragmentShaderWgsl` to run on WebGPU; a GLSL-only `applyEffect` is skipped with a warning. `textureUniforms` are not bound by the WebGPU post chain yet — sample extra textures from a `createItem` / `createScreen` fragment instead.
- `createParticles` draws `gl.POINTS` on WebGL2 and instanced quads on WebGPU (no `gl_PointSize` there); the disc falloff matches.
- `createObject` depth-tests against the engine depth buffer on WebGPU and does not back-face cull; `shaders.fragmentGlsl` falls back to the default material there.
- `loadTexture` picks the backend from the running engine, so load textures **after** `createScene()` / `acquireLayer()` resolves. A WebGL2 handle passed to a WebGPU draw is ignored with a warning.
- Texture fit: `loadTexture(src, { fit: "cover" })` + `createItem` / `createScreen` `{ texture, textureFit }`. Sample with `fitUv(vUv)`. Helpers: `resolveTextureUvTransform`, `applyTextureUv`, `textureFitToUni` (packs value5–8).
- `loadTexture` does not flip by default — `vUv` is top-origin on both backends. Env/matcap maps (`dir.xy * 0.5 + 0.5`) use the same default upload.
- `createMouseTrail().getTextureHandle()` is shaped like a `loadTexture()` result on both backends — pass it straight to `createItem({ texture })`. The trail reallocates with the canvas, so re-read the handle after a resize.

## Node / Bun — `shooosh/msdf`

Not exported from the browser entry. Needs optional `sharp` (icons) and `msdf-bmfont-xml` (fonts).

```ts
import { generateMsdf, generateFontAtlas, generateIconSdf } from "shooosh/msdf"

await generateMsdf(["fonts", "icons"], { outDir: "public/msdf" })
// CLI: pnpm msdf -- fonts/Inter.ttf icons/ --out public/msdf
```

| | |
| --- | --- |
| `generateFontAtlas` | TTF/OTF → atlas PNG + bmfont JSON (`fieldType: "sdf"` default) |
| `generateIconSdf` | SVG/PNG → single-channel SDF PNG + `{ type, width, height, spread }` |
| `generateMsdf` | walk files/dirs; writes `outDir/fonts` + `outDir/icons` |
| `alphaToSdf` | RGBA alpha → 0.5-at-edge distance field |

Full flags and defaults: [msdf.md](./msdf.md).

## Errors

| Error | When |
| --- | --- |
| `GpuUnavailableError` | Neither backend can start (`createEngine`) |
| `WebGLUnavailableError` | WebGL2 context failed |
| `ShaderCompileError` | Program compile/link failed (WebGL helper) |

Failed shader compile must not unmount the canvas.
