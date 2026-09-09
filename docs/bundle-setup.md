# Small production bundles

Unreleased. Use ESM imports and build-time shader artifacts. The default package
still includes both backends; `backend` on `createEngine` only chooses one at
runtime. It cannot remove the other implementation from emitted files.

## Pick a build target

```ts
// vite.config.ts — default is { backend: "both" }
import { defineConfig } from "vite"
import { shoooshShaders } from "shooosh/build"
export default defineConfig({
  plugins: [shoooshShaders({ backend: "webgl2" })],
})
```

The plugin resolves `shooosh` → `shooosh/webgl2` and `shooosh/dom` →
`shooosh/webgl2/dom`, and `.wgsl` imports contain only GLSL. `webgpu` performs the
matching operation for WGSL. Explicit conflicting backend entry imports fail.
Do not put a generic `shooosh` source alias ahead of this plugin: bundler aliases
can resolve first. The repository harness deliberately uses source aliases for
development; `backend.html` tests the published entries directly.

Without a resolver plugin, import the target explicitly:

```ts
import { createCanvasScene } from "shooosh/webgl2"
import { createDomLayer } from "shooosh/webgl2/dom"
import shader from "./hero-shader.mjs"
const scene = createCanvasScene(canvas, { screen: { shaders: shader } })
```

```sh
shooosh-shader hero.wgsl hero-shader.mjs --backend=webgl2 --minify
```

Equivalent WebGPU entries exist. Choose one target consistently across a page;
entries built for different targets own separate engine state. A single-backend
build does not fall back to the excluded backend. Probing unavailable hardware
returns `null`; conflicting explicit runtime options reject with a readable
error. `createCompute` returns `null` with a warning in WebGL2-only builds.
Keep native content available if engine creation fails.

Pre-generated shader pairs and runtime `compileShader` results are ordinary data:
selecting a runtime entry does not rewrite those objects. Generate them for the
same target to remove unused shader variants too. Utility and compiler subpaths
remain optional. ESM is the intended tree-shaking surface; CJS/IIFE are monolithic.

## Use the lightweight scene

```ts
import { createCanvasScene, createObject, createPostProcessor } from "shooosh"
import shader from "./hero.wgsl"
const scene = createCanvasScene(canvas, { autoInit: false, screen: { shaders: shader } })
await scene.init()
// Only import and create the optional features this page needs:
const mesh = scene.retain(createObject(null))
const post = scene.retain(createPostProcessor())
// Add authored effects to post as needed.
// scene.destroy() releases retained resources and the engine.
```

`createCanvasScene` owns an engine and optional screen. It shares lifecycle code
with the full `Scene` but imports no object, post, item-convenience or texture-URL
loader implementations. Supply a loaded texture and retain it when needed. It has
no `post` option, automatic `textureUrl`, `addItem`, `addObject` or
`getPostProcessor`. The existing `createScene`/`Scene` API keeps those conveniences
for compatibility. `retain` deduplicates cleanup by identity and immediately
releases resources arriving after scene destruction.

## Shader builds and minification

Example fragments now live in `.wgsl` files and import plain shader data. Copy the
sibling shader with the recipe. Fabric has three generated `.wgsl` variants;
`bun bin/example-shaders.ts` regenerates them from `examples/materials/`.
No live example calls the runtime compiler.

The Vite plugin minifies shader comments and horizontal whitespace in production
builds, keeping development text readable. Set `minify: false` to disable it.
Plain Rollup callers set `minify: true` explicitly (there is no Vite build-mode
hook). `shoooshBunShaders({ backend, minify })` provides the `.wgsl` transform for
Bun builds; it defaults to minification and requires explicit runtime entry imports.
The CLI exposes `--minify`; `shaderModule` accepts the same option.

Minification never renames symbols or merges tokens. Directive line boundaries
and quoted strings are preserved. Sources with backslash-newline continuations
are left unchanged. This is conservative source compaction, not shader optimization
or driver compilation. Compute and post shaders retain their existing contracts.

## Measurements and checks

Vite production consumers, total JavaScript across all emitted chunks, gzip-9:

| Consumer | Both | WebGL2 only | WebGPU only |
| --- | ---: | ---: | ---: |
| `createCanvasScene` | 14.3 kB | 8.4 kB | 10.2 kB |
| Full `createScene` | 33.8 kB | 18.8 kB | 24.3 kB |
| `createDomLayer` | 21.8 kB | 13.8 kB | 17.3 kB |

These retain API functions, without custom shader/assets. Figures are rounded,
kB = 1,000 bytes. They include chunks not necessarily fetched by the selected
backend. The dual-backend lightweight scene's initial download is 6.2 kB gzip.
See [exact backend results](./audits/2026-09-09-backend-builds.json).

`bun run bin/build.ts` checks default consumer budgets and backend exclusion in
Bun/Vite. `bun bin/test-backends.ts --report` refreshes the measured backend table.
`/backend.html?backend=webgl2` (or `webgpu`) in the dev harness checks actual
published entries, texture-URL loading, objects, particles, post, DOM activation and runtime conflict rejection.
