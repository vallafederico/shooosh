# shooosh

Native WebGL2 engine with WGSL fragment shaders. This is the package already used across our sites — scenes, a shared page-behind layer, DOM-tracked items, and a small post stack.

```shell
pnpm i shooosh
```

```js
import { createScene } from "shooosh"

createScene(canvas, {
  screen: {
    shaders: {
      fragment: `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;
void main() {
  outColor = vec4(vUv, 0.5 + 0.5 * sin(uUni[0].x), 1.0);
}`,
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
| `createEngine` | WebGL2 context, layered `onRender`, `onPostRender`, settle-aware raf. |
| `createScene` | Owns a canvas: optional fullscreen `screen`, post presets, items. |
| `acquireLayer` / `releaseLayer` | Shared fixed canvas behind the page. Refcounted. |
| `createItem` | DOM-tracked quad. IntersectionObserver-gated. `uUni` vec4[4]. |
| `createScreen` | Fullscreen plane on the current default engine. |
| `createObject` / `createParticles` / `createMsdfGlyphs` | 3D / particle / MSDF primitives. |
| `effects` | `bloom`, `bw`, `noise`, `custom` post presets. |
| `loadTexture` / `loadGlb` | Texture (cover/contain UV) and mesh-only GLB. |
| `convertWgslFragmentToGlsl` | WGSL subset → GLSL 300 es. |

### Shaders

Pass `shaders.fragment`:

- Full GLSL 300 es (`#version 300 es` … `out vec4 outColor`) is used as-is.
- Otherwise it is treated as WGSL and converted. Prefer GLSL for anything beyond a simple `fsMain`.

`vUv` is top-origin. Item / screen uniforms are 16 floats: `setUni({ value1 })` → `uUni[0].x`.

### Layer vs scene

Most site effects sit on the shared layer:

```js
import { acquireLayer, createItem, releaseLayer } from "shooosh"

const engine = acquireLayer()
if (!engine) return

const item = createItem(element, {
  shaders: { fragment: glsl },
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

`acquireLayer()` returns `null` when WebGL2 is missing. Leave the page readable.

## Roadmap

Shader-file imports and in-place HMR (Vite + Bun) are next. [vgpu](https://github.com/vercel-labs/vgpu) is the DX reference — named uniforms, a small shader stdlib, `check` CLI — not a WebGPU rewrite. See [ROADMAP.md](./ROADMAP.md).

## Publish

```shell
pnpm release:patch
```

Builds `dist/` (esm, cjs, IIFE, types) and publishes the root package.
