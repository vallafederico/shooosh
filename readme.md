# shooosh

**WGSL-first site GPU.** WebGPU when the browser can, WebGL2 when it can’t. Same `createScene` / `createItem` / `acquireLayer` API either way.

The engine already running on our sites — a fullscreen fragment, a page-behind canvas, DOM-tracked quads. Not a scene graph. Not Three.

```shell
pnpm i shooosh
```

```js
import { createScene } from "shooosh"

createScene(canvas, {
  screen: {
    shaders: {
      fragment: `
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

IIFE attaches `window.Shooosh`.

# Docs

| | |
| --- | --- |
| [API](./docs/api.md) | What to call |
| [Shader contract](./docs/shader-contract.md) | `fn fsMain`, `vUv`, `uUni` |
| [Site patterns](./docs/site-patterns.md) | How we actually mount this on pages |
| [WGSL ↔ GLSL](./docs/shader-translation.md) | Fallback converter + mapping |
| [Roadmap](./ROADMAP.md) | What’s next |
| [Agents](./llms.txt) | `llms.txt` / `agents.md` / skills |

# Two ways in

### 1. A canvas you own

Dedicated `<canvas>` — fullscreen shader, section hero, or a Solid/React app shell.

```js
const scene = createScene(canvas, {
  autoInit: false,
  dpr: { max: 1.5 },
  screen: { shaders: { fragment: wgsl } },
})
await scene.init()
```

SSR: `autoInit: false`, then `await scene.init()`. Canvas is usually `position: fixed; inset: 0; pointer-events: none; z-index: -1`.

### 2. A layer behind the page

Shared refcounted canvas. DOM nodes become GPU quads.

```js
import { acquireLayer, createItem, releaseLayer } from "shooosh"

const engine = await acquireLayer()
if (!engine) return // no GPU — leave the page readable

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

`createItem` queues until an engine exists, so mount order doesn’t matter. The element must be transparent where the shader should show. An opaque `body` background hides the layer entirely.

# Shaders

Author **WGSL**. `fn fsMain() -> vec4f`. `vUv` is top-origin.

| JS | WGSL | GLSL |
| --- | --- | --- |
| `setUni({ value1: t })` | `uUni.values0.x` | `uUni[0].x` |

- WebGPU: your `fsMain` is wrapped (`Uni`, `vUv`, `vsMain`) and run as-is.
- WebGL2: the same source is converted to GLSL 300 es.
- `#version 300 es` still works as a WebGL2 escape hatch. Port it with `convertGlslFragmentToWgsl` so WebGPU can run it.

A failed compile keeps the last good program and logs. It does not blank the page.

# Backends

`createEngine` / `createScene` / `acquireLayer` probe WebGPU first, then WebGL2.

```js
await createEngine(canvas, { backend: "auto" }) // default
engine.backend // "webgpu" | "webgl2"
```

Force one for debugging: `{ backend: "webgl2" }` or the harness `?backend=webgpu`. Site `onFrame` hooks should use `frame.now` / `frame.delta` / `frame.backend` — not `frame.gl`.

Post, textures, objects, particles, and MSDF are **WebGL2-only** today. On WebGPU they warn or no-op.

# API (short)

Full table in [docs/api.md](./docs/api.md).

| | |
| --- | --- |
| `probeRenderer` | `"webgpu"` \| `"webgl2"` \| `null` |
| `createEngine` | async. context + settle-aware raf |
| `createScene` | owns a canvas: screen, post, items |
| `acquireLayer` / `releaseLayer` | shared page-behind canvas |
| `createItem` / `createScreen` | DOM quad / fullscreen plane |
| `effects` | `bloom`, `bw`, `noise`, `custom` (`applyEffect`) |
| `createParticles` / `createMsdfGlyphs` / `createObject` | WebGL2 primitives |
| `convertWgslFragmentToGlsl` / `convertGlslFragmentToWgsl` | subset translators |

`createEngine` and `acquireLayer` are async. `acquireLayer()` / `probeRenderer()` returning `null` is valid.

# Repo

```
package/    published library
harness/    vite playground  —  pnpm --filter harness dev
web/        astro landing
docs/       contract, API, site patterns
bin/        esm / cjs / IIFE
```

```shell
pnpm i
pnpm dev
pnpm test
pnpm build:package
```

```shell
pnpm release:patch
```
