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

`createEngine` probes WebGPU first and falls back to WebGL2. Force a backend with `{ backend: "webgpu" | "webgl2" }` or the harness `?backend=` query.

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

Full table: [docs/api.md](./docs/api.md). Shader rules: [docs/shader-contract.md](./docs/shader-contract.md).

| Name | Description |
| --- | --- |
| `probeRenderer` | `"webgpu"` if the adapter is there, else `"webgl2"`, else `null`. |
| `createEngine` | Async. Probe WebGPU, else WebGL2. Layered `onRender` / `onPostRender`, settle-aware raf. |
| `createScene` | Owns a canvas: optional fullscreen `screen`, post presets, items. |
| `acquireLayer` / `releaseLayer` | Shared fixed canvas behind the page. Refcounted. Async acquire. |
| `createItem` | DOM-tracked quad. `uUni` vec4[4]. |
| `createScreen` | Fullscreen plane on the current default engine. |
| `createObject` / `createParticles` / `createMsdfGlyphs` | 3D / particle / MSDF primitives (WebGL2 today). |
| `effects` | `bloom`, `bw`, `noise`, `custom` post presets (WebGL2 today). |
| `loadTexture` / `loadGlb` | Texture and mesh-only GLB (WebGL2 today). |
| `convertWgslFragmentToGlsl` | WGSL subset → GLSL 300 es (WebGL fallback). |
| `convertGlslFragmentToWgsl` | GLSL 300 es → WGSL `fsMain` (port an escape-hatch shader). |

### Shaders

**Author in WGSL.** Pass `shaders.fragment` as `fn fsMain`.

- On WebGPU: the source is wrapped (`Uni`, `vUv`, `vsMain`) and run as-is.
- On WebGL2: it is converted to GLSL 300 es.
- Full GLSL 300 es (`#version 300 es`) still works as an escape hatch on WebGL2. Port it with `convertGlslFragmentToWgsl` so WebGPU can run it.

`vUv` is top-origin. Item / screen uniforms are 16 floats: `setUni({ value1 })` → `uUni.values0.x` / `uUni[0].x`.

Agents porting shaders should use the Cursor skills in `.cursor/skills/wgsl-to-glsl` and `.cursor/skills/glsl-to-wgsl`. Mapping: [docs/shader-translation.md](./docs/shader-translation.md).

### Layer vs scene

Most site effects sit on the shared layer:

```js
import { acquireLayer, createItem, releaseLayer } from "shooosh"

const engine = await acquireLayer()
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

WebGPU renderer (default when the probe succeeds) and shader-file HMR (Vite + Bun). [vgpu](https://github.com/vercel-labs/vgpu) is the DX reference. Agents: [agents.md](./agents.md), [llms.txt](./llms.txt), [docs/](./docs/README.md), [docs/agent-tasks/](./docs/agent-tasks/). See [ROADMAP.md](./ROADMAP.md).

## Publish

```shell
pnpm release:patch
```

Builds `dist/` (esm, cjs, IIFE, types) and publishes the root package.
