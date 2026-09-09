# shooosh, OGL and Three.js bundle comparison

Captured 2026-09-09T11:16:44.735Z. OGL 1.0.11 and Three.js 0.186.0 were the npm latest
versions checked during this audit. Both are pinned in the reproduction script;
the downloaded tarballs are checked against npm SHA-512 integrity. Neither was
added to the repository's dependencies.

Vite 7.3.6 with esbuild minification, browser ESM, target esnext,
`inlineDynamicImports: true`, one complete JavaScript file and gzip level 9.
Each table entry is **minified / gzip kB**, with 1 kB = 1,000 bytes.

| Consumer | shooosh Both (default) | shooosh WebGL2 | shooosh WebGPU | OGL | Three.js |
| --- | ---: | ---: | ---: | ---: | ---: |
| Engine / renderer API | 12.7 / 4.8 | 8.5 / 3.5 | 8.6 / 3.6 | 11.5 / 3.5 | 510.8 / 126.7 |
| Fullscreen primitive API | 31.0 / 11.5 | 19.1 / 7.5 | 21.5 / 8.6 | 44.2 / 12.8 | 510.8 / 126.7 |
| 3D box-related API | 35.7 / 13.0 | 23.3 / 8.9 | 25.9 / 10.1 | 48.7 / 14.1 | 510.8 / 126.7 |
| Animated fullscreen app | 33.4 / 12.1 | 21.4 / 8.1 | 23.7 / 9.3 | 45.1 / 13.2 | 511.8 / 127.1 |
| All root exports (different scope) | 133.7 / 41.2 | 84.9 / 26.3 | 90.0 / 29.0 | 133.2 / 39.3 | 745.5 / 190.4 |

The matching fullscreen app uses an animated UV gradient, WebGL2, DPR 1, viewport
resizing and teardown. All three WebGL2 implementations were verified in the browser; the WebGPU implementations were also rendered in a supported browser. OGL and Three.js use a
fullscreen triangle with custom GLSL; shooosh uses `createCanvasScene` with a
build-prepared shader. The screenshots were inspected at different animation
times, so this is visual verification rather than pixel-exact comparison.

Shooosh's fullscreen app with both renderer paths and both shader variants emits
33,364 minified / 12,146 gzip bytes. Its full dual-backend namespace emits 133,741 /
41,218 bytes. Those rows are retained separately in the JSON; the main table now shows all three shooosh targets. The WebGPU-only app uses
WGSL and explicitly requests WebGPU; the dual-backend app contains both shader
variants and runs WebGL2. The separate WebGPU table below compares the same backend with Three.js.

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

Three.js WebGPU API fixtures substitute `WebGPURenderer`,
`MeshBasicNodeMaterial` and `OrthographicCamera` for the WebGL equivalents
(the box fixture retains `PerspectiveCamera`). The app supplies clip-space
`vertexNode` and an animated UV `fragmentNode`, with linear output color space.
The all-export row retains `three/webgpu`; it does not additionally retain the
entire `three/tsl` namespace or addons. The app includes its actual TSL imports.
The fallback inclusion is verified in the pinned package's
`src/renderers/webgpu/WebGPURenderer.js`, which imports both backend classes.

## API mapping

The API-only fixtures preserve callable exports via `globalThis.api`, without
mounting a scene. They measure reachable code for related tasks, not identical
APIs or complete application behavior.

| Task | shooosh | OGL | Three.js |
| --- | --- | --- | --- |
| Engine | `createEngine` | `Renderer` | `WebGLRenderer` |
| Fullscreen primitive | `initEngine`, `createScreen` | `Renderer`, `Geometry`, `Program`, `Mesh` | `WebGLRenderer`, `BufferGeometry`, `BufferAttribute`, `RawShaderMaterial`, `Mesh`, `Camera` |
| Canvas scene | `createCanvasScene` | Same fullscreen exports | Same fullscreen exports |
| Box | `initEngine`, `createObject` | `Renderer`, `Camera`, `Box`, `Program`, `Mesh` | `WebGLRenderer`, `PerspectiveCamera`, `BoxGeometry`, `RawShaderMaterial`, `Mesh` |

Three.js's renderer keeps substantial shared rendering support reachable even
when a consumer uses a custom shader. The engine-only and primitive rows therefore
have similar Three.js sizes. This is the measured result for its public `three`
entry, not a claim that all its exports are used by the test shader.

## Scope and limits

- The WebGL table imports Three.js from `three`; the WebGPU table uses
  `three/webgpu` and the app's TSL imports. Addons are not included. See the [official renderer docs](https://threejs.org/docs/#WebGLRenderer)
  and [RawShaderMaterial](https://threejs.org/docs/#RawShaderMaterial).
- OGL's fixture follows its [official fullscreen API](https://github.com/oframe/ogl#usage).
- Full namespaces contain different feature sets. OGL includes math and extras;
  Three.js includes extensive 3D functionality; shooosh excludes optional DOM,
  utils, compiler and Node MSDF entries from its root. Those rows give package
  context and must not be presented as feature-equivalent comparisons.
- All imports use their npm/package ESM export layouts. OGL publishes source ESM;
  Three.js and shooosh publish bundled ESM. No source aliases substitute smaller
  private modules. A second pass with Bun 1.4.0 is included in the raw results.
- One-file gzip is different from adding gzip sizes across separately compressed
  lazy chunks. No implementation receives a size discount for deferred downloads.
- HTML, source maps, HTTP overhead and assets are excluded. No frame-time, GPU
  performance, initialization-latency or memory measurements were taken.

## Reproduction and raw results

```sh
bun run bin/build.ts
bun bin/compare-ogl.ts
# Retain generated fullscreen pages for a local static server:
bun bin/compare-ogl.ts --keep
```

The existing script name is retained for compatibility; it now compares all three
libraries. It performs 112 builds (8 fixtures × 7 library/target choices × 2 bundlers), downloads
only into a temporary directory, and writes
[the complete JSON report](./2026-09-09-library-comparison.json). `--keep` prints a
preview directory; open its index with `?library=ogl`, `three`, `shooosh`
(WebGL2), `shoooshBoth`, `shoooshWebgpu`, `shoooshBothGpu` or `threeWebgpu`. The JSON maps these variant keys
explicitly. Historical `dual-*` fixture rows remain for continuity.

The earlier [OGL-only report](./2026-09-09-ogl-optimized.md) remains a snapshot of
the preceding comparison. The library implementation is unchanged by this audit.

## Published shooosh output formats

Sizes are minified / gzip kB. ESM values come from the all-export Vite consumer;
CJS and IIFE are direct measurements of generated files recorded in `formats`.
Compression uses Bun’s `node:zlib` at level 9; earlier Python/zlib artifact
measurements may differ slightly despite using the same compression level.

| Backend target | Import | ESM, all exports bundled | CommonJS file | IIFE / script tag |
| --- | --- | ---: | ---: | ---: |
| Both (default) | `shooosh` | 133.7 / 41.2 | 136.3 / 41.7 | 134.9 / 41.3 |
| WebGL2 only | `shooosh/webgl2` | 84.9 / 26.3 | 87.0 / 26.5 | Not built |
| WebGPU only | `shooosh/webgpu` | 90.0 / 29.0 | 91.8 / 29.5 | Not built |

Optional entries and their environments are listed in the README. Only the
dual-backend IIFE is currently built. No new build format was introduced by
this documentation update.
