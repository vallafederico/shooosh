# shooosh

[![npm](https://img.shields.io/npm/v/shooosh.svg)](https://www.npmjs.com/package/shooosh)
[![license](https://img.shields.io/npm/l/shooosh.svg)](./LICENSE)

**WGSL-first site GPU.** WebGPU when the browser can, WebGL2 when it can’t. Same `createScene` / `createItem` / `acquireLayer` API either way.

The engine already running on our sites — a fullscreen fragment, a page-behind canvas, DOM-tracked quads. Not a scene graph. Not Three.

**Docs:** [docs/](./docs/README.md) · [Changelog](./CHANGELOG.md) · [Getting started](./docs/getting-started.md) · [API](./docs/api.md) · [Shader contract](./docs/shader-contract.md)

**For coding agents:** [llms.txt](./llms.txt) → [task-based usage guide](./docs/agent-usage.md). Model/texture tooling and `shooosh/rig` are opt-in additions available in shooosh 0.0.7 and shooosh-model 0.1.0; the guide states exact imports and limits.

```shell
pnpm i shooosh
```

Generate a shader module with `shooosh-shader gradient.wgsl gradient-shader.mjs`,
or use the [`.wgsl` build plugin](./docs/shader-build.md).

```js
import { createCanvasScene } from "shooosh"
import shader from "./gradient-shader.mjs"
createCanvasScene(canvas, { screen: { shaders: shader } })
```

WGSL translation runs at build time. Dynamic strings can explicitly opt into
`compileShader` from `shooosh/compiler`. Version 0.0.6 requires this migration from 0.0.5.

```html
<script src="https://unpkg.com/shooosh"></script>
```

IIFE attaches `window.Shooosh`. Full mounts (owned canvas vs page-behind layer): [getting started](./docs/getting-started.md).

## Bundle size

The full root browser build is **134.9 kB minified / 41.3 kB gzipped**.
ESM imports can be tree-shaken to the features you use; the browser entry has
**zero runtime dependencies**.

| Build / consumer | Minified | Gzip |
| --- | ---: | ---: |
| Full root browser build (`shooosh.min.js`, IIFE) | 134.9 kB | 41.3 kB |
| Full root CommonJS build | 136.3 kB | 41.7 kB |
| `createCanvasScene` — initial ESM download | 15.5 kB | 6.2 kB |
| Full `createScene` — initial ESM download | 37.1 kB | 12.8 kB |
| `createItem` + `acquireLayer` — initial ESM download | 13.3 kB | 5.7 kB |
| `createDomLayer` — initial ESM download | 28.3 kB | 11.1 kB |

Measured from the **0.0.6 source checkout on 2026-09-09**. kB = 1,000 bytes; gzip level 9. ESM rows are Vite production consumers
and include their initial static imports. Backend code loads separately: all
emitted chunks together total 33.3 / 14.3 kB for canvas scene, 85.5 / 33.8 kB for full scene, 31.5 / 14.0 kB for
item + layer, and 51.6 / 21.8 kB for DOM (minified / gzip). A selected backend
may fetch only part of that total.

The full root builds exclude optional DOM/utils subpaths and Node-only MSDF
tools. Example-owned Rapier physics is a separate optional download. Source maps,
docs and assets are excluded from these JavaScript transfer sizes.
See the [size and performance audit](./docs/audits/2026-09-09-physics-utils-performance.md)
for earlier audit context. Current rows include build-time shader extraction;
`bin/test-tree-shaking.ts` reports current exact consumer bytes. Reproduce the checks with
`bun run bin/build.ts`.

For a **WebGL2-only** canvas scene, total emitted JavaScript drops to **20.8 kB
minified / 8.4 kB gzip**; WebGPU-only is **23.6 / 10.2 kB**. Default remains both.
See [small bundle setups](./docs/bundle-setup.md) for backend entry imports,
production shader builds and measurement details.

### shooosh build targets and formats

Every size below is **minified / gzip kB**. ESM retains all root exports and is
rebundled into one file with Vite for comparison; actual ESM consumers can
tree-shake and split it. CommonJS and IIFE columns measure the complete generated
files directly, so their minification and sizes differ slightly. Format and
comparison tables use gzip-9 through Bun’s `node:zlib`.

| Backend target | Import | ESM, all exports bundled | CommonJS file | IIFE / script tag |
| --- | --- | ---: | ---: | ---: |
| Both (default) | `shooosh` | 133.7 / 41.2 | 136.3 / 41.7 | 134.9 / 41.3 |
| WebGL2 only | `shooosh/webgl2` | 84.9 / 26.3 | 87.0 / 26.5 | Not built |
| WebGPU only | `shooosh/webgpu` | 90.0 / 29.0 | 91.8 / 29.5 | Not built |

The IIFE attaches `window.Shooosh`; backend-specific IIFEs are not currently
produced. Single-backend entries never fall back to the excluded renderer.

Optional entry points stay separate from the root sizes above:

| Entry | Backend scope | Formats / environment |
| --- | --- | --- |
| `shooosh/dom` | Both | ESM + CommonJS, browser |
| `shooosh/webgl2/dom` | WebGL2 only | ESM + CommonJS, browser |
| `shooosh/webgpu/dom` | WebGPU only | ESM + CommonJS, browser |
| `shooosh/utility`, `shooosh/utils` | Renderer-independent | ESM + CommonJS, browser |
| `shooosh/compiler` | Optional runtime shader conversion | ESM + CommonJS, browser-compatible |
| `shooosh/build` | Shader generation and bundler plugins | ESM + CommonJS, Node/Bun |
| `shooosh/msdf` | Font/icon asset generation | ESM, Node/Bun; optional native dependencies |

### Compared with OGL and Three.js

Same Vite production settings, published ESM imports, one complete JavaScript file,
gzip level 9. Each cell is **minified / gzip kB** (1 kB = 1,000 bytes).
Measured 2026-09-09: shooosh **0.0.6**, OGL **1.0.11**, Three.js **0.186.0**.

| Consumer | shooosh Both (default) | shooosh WebGL2 | shooosh WebGPU | OGL | Three.js |
| --- | ---: | ---: | ---: | ---: | ---: |
| Engine / renderer API | 12.7 / 4.8 | 8.5 / 3.5 | 8.6 / 3.6 | 11.5 / 3.5 | 510.8 / 126.7 |
| Fullscreen primitive API | 31.0 / 11.5 | 19.1 / 7.5 | 21.5 / 8.6 | 44.2 / 12.8 | 510.8 / 126.7 |
| 3D box-related API | 35.7 / 13.0 | 23.3 / 8.9 | 25.9 / 10.1 | 48.7 / 14.1 | 510.8 / 126.7 |
| Animated fullscreen app | 33.4 / 12.1 | 21.4 / 8.1 | 23.7 / 9.3 | 45.1 / 13.2 | 511.8 / 127.1 |
| All root exports (different scope) | 133.7 / 41.2 | 84.9 / 26.3 | 90.0 / 29.0 | 133.2 / 39.3 | 745.5 / 190.4 |

API rows retain the relevant callable exports; the fullscreen app includes a
shader, animation, viewport resizing and cleanup. The three WebGL2 app
implementations were verified in the browser.
Shooosh columns show each build target, including its matching shader variants.
**Both remains the default**, including in the example gallery and its backend
switcher. OGL and Three.js use WebGL2 in this comparison; the shooosh WebGPU
column measures the same task on a different backend.

These libraries have different feature scopes: Three.js provides a much broader
3D renderer, and the all-export rows are not feature-parity comparisons. Three.js
uses `WebGLRenderer` from `three` in the table above; the WebGPU comparison follows below.
This table compares bundle size, not runtime speed. See the
[fixtures, methodology and exact bytes](./docs/audits/2026-09-09-library-comparison.md).
Reproduce with `bun bin/compare-ogl.ts` after building shooosh.

### WebGPU comparison

Same bundling settings and animated fullscreen task, with WebGPU selected on
supported browsers. Three.js uses its public `three/webgpu` entry; its
`WebGPURenderer` **also bundles a WebGL2 fallback**. Shooosh Both is the comparable
fallback-capable build; the dedicated WebGPU entry removes WebGL2 entirely.
Each cell is **minified / gzip kB**.

| Consumer | shooosh WebGPU only | shooosh Both (WebGPU selected) | Three.js WebGPU + fallback | OGL |
| --- | ---: | ---: | ---: | --- |
| Engine / renderer API | 8.6 / 3.6 | 12.7 / 4.8 | 775.0 / 210.5 | Unsupported |
| Fullscreen primitive API | 21.5 / 8.6 | 31.0 / 11.5 | 775.0 / 210.5 | Unsupported |
| 3D box-related API | 25.9 / 10.1 | 35.7 / 13.0 | 775.0 / 210.5 | Unsupported |
| Animated fullscreen app | 23.7 / 9.3 | 33.4 / 12.1 | 882.7 / 240.6 | Unsupported |
| All entry exports (different scope) | 90.0 / 29.0 | 133.7 / 41.2 | 1089.4 / 299.5 | Unsupported |

The Three.js app imports TSL shader nodes from `three/tsl`; shooosh uses
build-prepared WGSL. Both include the shader, animation, resize handling and
cleanup. The fixtures were rendered in a WebGPU-capable browser; the Three.js
fixture rejects fallback so it cannot silently count WebGL2 as WebGPU.
API rows retain related callable exports rather than rendering a scene.
These are bundle-size measurements, not runtime performance or feature parity.

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
