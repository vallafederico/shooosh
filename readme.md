# shooosh

WGSL-first site engine. **WebGPU when the browser can, WebGL2 when it can’t.** Same API either way: scenes, a shared page-behind layer, DOM-tracked items, and a small post stack.

```shell
pnpm i shooosh
```

```js
import { createScene } from "shooosh"

createScene(canvas, {
  screen: {
    shaders: {
      fragment: `
@fragment
fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  return vec4f(vUv, 0.5 + 0.5 * sin(t), 1.0);
}
`,
    },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  },
})
```

```html
<script src="https://unpkg.com/shooosh"></script>
```

The IIFE build attaches `window.Shooosh`.

Today the live renderer is WebGL2 (WGSL is converted to GLSL). The WebGPU backend is the next track — see [ROADMAP.md](./ROADMAP.md). `probeRenderer()` already reports which backend the browser can run.

## Repo

| Path | What |
| --- | --- |
| `package/` | Library source. This is what npm publishes. |
| `harness/` | Working playground. Edit `package/` and hot-reload. |
| `web/` | Public showcase site. |
| `bin/` | ESM / CJS / IIFE build + publish checks. |

```shell
pnpm i
pnpm dev          # harness + web
pnpm --filter harness dev
pnpm test
pnpm build:package
```

## API

| Name | Description |
| --- | --- |
| `probeRenderer` | `"webgpu"` if the adapter is there, else `"webgl2"`, else `null`. |
| `createEngine` | Context + layered `onRender` / `onPostRender`, settle-aware raf. WebGL2 today. |
| `createScene` | Owns a canvas: optional fullscreen `screen`, post presets, items. |
| `acquireLayer` / `releaseLayer` | Shared fixed canvas behind the page. Refcounted. |
| `createItem` | DOM-tracked quad. IntersectionObserver-gated. `uUni` vec4[4]. |
| `createScreen` | Fullscreen plane on the current default engine. |
| `createObject` / `createParticles` / `createMsdfGlyphs` | 3D / particle / MSDF primitives. |
| `effects` | `bloom`, `bw`, `noise`, `custom` post presets. |
| `loadTexture` / `loadGlb` | Texture (cover/contain UV) and mesh-only GLB. |
| `convertWgslFragmentToGlsl` | Fallback path: WGSL subset → GLSL 300 es. |

### Shaders

**Author in WGSL.** Pass `shaders.fragment` as `fsMain`.

- On WebGPU (upcoming): the source is used as-is.
- On WebGL2 (current): it is converted to GLSL 300 es.
- Full GLSL 300 es (`#version 300 es`) still works as an escape hatch for existing sites.

`vUv` is top-origin. Item / screen uniforms are 16 floats: `setUni({ value1 })` → `uUni[0].x` / `uUni.values0.x`.

### Layer vs scene

Most site effects sit on the shared layer:

```js
import { acquireLayer, createItem, releaseLayer } from "shooosh"

const engine = acquireLayer()
if (!engine) return

const item = createItem(element, {
  shaders: { fragment: wgsl },
  onFrame(self, frame) {
    self.setUni({ value1: frame.now * 0.001 })
  },
})

return () => {
  item.destroy()
  releaseLayer()
}
```

`createScene` is for a dedicated `<canvas>` — fullscreen shaders, section-scoped work, or scene-wide post.

`acquireLayer()` / `probeRenderer()` return `null` when no GPU backend is available. Leave the page readable.

## Roadmap

WebGPU renderer (default when the probe succeeds) and shader-file HMR (Vite + Bun). [vgpu](https://github.com/vercel-labs/vgpu) is the DX reference. See [ROADMAP.md](./ROADMAP.md).

## Publish

```shell
pnpm release:patch
```

Builds `dist/` (esm, cjs, IIFE, types) and publishes the root package.
