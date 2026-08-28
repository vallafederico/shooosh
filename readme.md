# shooosh

[![npm](https://img.shields.io/npm/v/shooosh.svg)](https://www.npmjs.com/package/shooosh)
[![license](https://img.shields.io/npm/l/shooosh.svg)](./LICENSE)

**WGSL-first site GPU.** WebGPU when the browser can, WebGL2 when it can’t. Same `createScene` / `createItem` / `acquireLayer` API either way.

The engine already running on our sites — a fullscreen fragment, a page-behind canvas, DOM-tracked quads. Not a scene graph. Not Three.

**Docs:** [docs/](./docs/README.md) · [Getting started](./docs/getting-started.md) · [API](./docs/api.md) · [Shader contract](./docs/shader-contract.md)

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
  let t = uUni.values0.x
  return vec4f(vUv, 0.5 + 0.5 * sin(t), 1.0)
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

IIFE attaches `window.Shooosh`. Full mounts (owned canvas vs page-behind layer): [getting started](./docs/getting-started.md).

## Documentation

This is the GitHub landing page. The [docs folder](./docs/README.md) is the documentation set.

| | |
| --- | --- |
| [Getting started](./docs/getting-started.md) | Install, two mounts, first shader |
| [Examples](./examples/README.md) | Using the library: plasma, noise, SDF, mouse, bloom, fluid, scroll, cards |
| [API](./docs/api.md) | What to call |
| [Shader contract](./docs/shader-contract.md) | `fn fsMain`, `vUv`, `uUni` |
| [Site patterns](./docs/site-patterns.md) | How we mount this on pages |
| [MSDF](./docs/msdf.md) | Node/Bun font + icon SDF generators |
| [WGSL ↔ GLSL](./docs/shader-translation.md) | Fallback converter + mapping |
| [Roadmap](./ROADMAP.md) | What’s next |

## Agent-first

Built so a coding agent can open the repo and implement the next slice without inventing an API. What that means, in order: [docs/agent-first.md](./docs/agent-first.md).

| | |
| --- | --- |
| [`llms.txt`](./llms.txt) | Machine index — start here |
| [`agents.md`](./agents.md) | Product identity, rules, how to pick work |
| [`docs/agent-tasks/`](./docs/agent-tasks/) | Numbered briefs. Lowest `status: todo` wins |

## Backends

`createEngine` / `createScene` / `acquireLayer` probe WebGPU first, then WebGL2. `acquireLayer()` / `probeRenderer()` returning `null` is valid — leave the page readable.

Scenes, items, textures, post, objects, particles, MSDF and the mouse trail all run on both backends. WGSL is the authored language: a `#version 300 es` fragment is a WebGL2 escape hatch and is ignored on WebGPU. Bake atlases with [`shooosh/msdf`](./docs/msdf.md) (Node/Bun, not the site bundle).

## Repo

```
package/    published library
docs/       documentation hub (link this from GitHub)
examples/   copy-paste library usage (plasma, fluid, items, post)
harness/    vite playground  —  pnpm --filter harness dev
web/        astro landing
bin/        esm / cjs / IIFE / msdf CLI
```

```shell
pnpm i
pnpm dev
pnpm test
pnpm build:package
```

## License

MIT. See [LICENSE](./LICENSE).
