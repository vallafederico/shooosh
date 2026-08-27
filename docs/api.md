# Public API

[Documentation](./README.md)

Source of truth: [`package/index.ts`](../package/index.ts). This page is the human/agent summary after the WebGPU renderer.

## Choose a path

| Need | Call |
| --- | --- |
| Fullscreen fragment on its own canvas | `createScene(canvas, { screen })` |
| Page-behind canvas + DOM quads | `await acquireLayer()` then `createItem(el, …)` |
| Which GPU am I on? | `await probeRenderer()` or `engine.backend` |
| Force a backend | `{ backend: "webgpu" \| "webgl2" }` or `?backend=` |

`acquireLayer()` / `probeRenderer()` return `null` when nothing is available. Leave the page readable.

Site recipes (app-shell canvas, SSR init, Webflow, particles, MSDF): [site-patterns.md](./site-patterns.md). Bake font/icon atlases: [msdf.md](./msdf.md).

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

Settle window: the loop stays hot for 250ms after the last dirty mark (scroll, pointer, `setUni`, `requestFrame`).

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

## Shaders

Author WGSL `fn fsMain`. See [shader-contract.md](./shader-contract.md).

```ts
convertWgslFragmentToGlsl(wgsl, { includeUv: true }) // WebGL fallback
convertGlslFragmentToWgsl(glsl)                     // port an escape-hatch shader
```

`#version 300 es` still compiles on WebGL2 only.

## WebGL2-only today

These no-op, warn, or throw a readable error on WebGPU:

- `effects.*` / `createPostProcessor` / `onPostRender`
- `loadTexture` / `loadGlb`
- `createObject` / `createParticles` / `createMsdfGlyphs`
- `createMouseTrail` (post-based)

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
