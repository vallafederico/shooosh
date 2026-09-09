# OGL comparison after backend and shader optimization

See the [expanded comparison including Three.js](./2026-09-09-library-comparison.md) for the README table and latest combined measurements.

Measured 2026-09-09 against **OGL 1.0.11**, the npm latest version checked during
this audit, and the current unreleased shooosh builds. No library dependencies
were added. OGL's downloaded tarball was verified against npm SHA-512 integrity.

The most useful result: the complete WebGL2 fullscreen application is **21,362
bytes minified / 8,129 bytes gzip** with shooosh versus **45,078 / 13,164 bytes**
with OGL. That is **38.2% less gzip transfer**, for the fixtures below. Both were
visually verified in the browser. This is a bundle comparison, not a frame-time,
startup-time or GPU-performance benchmark.

## Same bundler, complete payload

Vite 7.3.6 production with esbuild minification, browser ESM, target esnext,
inlineDynamicImports, **one complete JS file**, gzip level 9. Numbers below are
**minified bytes / gzip bytes**. Single-backend rows use `shooosh/webgl2`.

| Fixture | OGL | shooosh | Gzip difference |
| --- | ---: | ---: | ---: |
| Engine / renderer exports | 11,465 / 3,488 | 8,532 / 3,502 | +0.4% |
| Fullscreen primitive exports | 44,163 / 12,758 | 19,123 / 7,509 | -41.1% |
| Lightweight canvas scene exports | 44,163 / 12,758 | 20,993 / 8,040 | -37.0% |
| 3D box-related exports | 48,703 / 14,116 | 23,256 / 8,875 | -37.1% |
| Animated fullscreen application | 45,078 / 13,164 | 21,362 / 8,129 | -38.2% |
| All root exports (different scope) | 133,249 / 39,257 | 84,949 / 26,299 | -33.0% |
| Fullscreen application, shooosh dual-backend | 45,078 / 13,164 | 33,364 / 12,146 | -7.7% |
| All root exports, shooosh dual-backend | 133,249 / 39,257 | 133,741 / 41,218 | +5.0% |

Bun 1.4.0 independently reproduces the direction of these results: the fullscreen
application is 13,177 bytes gzip for OGL and 7,852 for shooosh (40.4% smaller).
The engine-only comparison is effectively tied and varies slightly by bundler.
Exact results for both bundlers: [JSON](./2026-09-09-ogl-optimized.json).

## What “same API” means here

The APIs are different, so the fixtures map rendering capabilities rather than
assuming identical class names:

| Capability | OGL retained exports | shooosh retained exports |
| --- | --- | --- |
| Engine | `Renderer` | `createEngine` |
| Fullscreen primitive | `Renderer`, `Geometry`, `Program`, `Mesh` | `initEngine`, `createScreen` |
| Canvas scene | Same fullscreen exports | `createCanvasScene` |
| 3D box | `Renderer`, `Camera`, `Box`, `Program`, `Mesh` | `initEngine`, `createObject` |

These export-retention rows preserve callable APIs in `globalThis.api`. They
measure what remains reachable, not a rendered application. The 3D box row is an
approximation: shooosh's object API includes additional shapes and DOM placement,
while OGL exposes a general camera/transform/geometry model.

The **fullscreen application** row runs an authored UV gradient with an animated
blue channel, WebGL2, DPR 1, viewport resizing, frame updates and cleanup. OGL
uses a fullscreen triangle and explicit GLSL/uniform/RAF code; shooosh uses the
screen primitive through `createCanvasScene`, a build-prepared shader and its
frame callback. Both implementations and comparison settings are included in
[`bin/compare-ogl.ts`](../../bin/compare-ogl.ts). No HTML, assets, source maps or
HTTP overhead are counted. The browser checks confirm rendering; they do not
establish pixel-exact equivalence at independently sampled animation times.

For the dual-backend application row, shooosh includes both renderer paths and
both prepared shader variants, while the demo explicitly runs WebGL2. OGL stays
WebGL-only. The full dual-backend root is **5.0% larger** than OGL in this Vite
measurement. The smaller fullscreen consumer reflects the new composition and
build boundaries, not a claim that every shooosh application is smaller.

## Limits and reproduction

- Both consume their published ESM layout: OGL distributes source modules;
  shooosh distributes prebundled, annotated ESM. No source aliases are used.
- All-export rows have different scope. OGL bundles math and extras; shooosh root
  excludes optional DOM/utils/compiler/MSDF subpaths. They are package context,
  not feature-parity scores.
- Single-file gzip differs from summing gzip across independently compressed lazy
  chunks in the README. This comparison gives neither library credit for code
  that is merely deferred.
- The authored shader compiler runs only inside this audit's build process and
  is absent from shooosh's browser output. GPU/driver compilation still occurs.

```sh
bun run bin/build.ts
bun bin/compare-ogl.ts
# Optional: retain generated fullscreen pages for visual verification
bun bin/compare-ogl.ts --keep
```

The audit downloads pinned OGL into a temporary directory and writes the JSON
report. It does not change package dependencies. `--keep` prints a preview folder
that can be served with a local static HTTP server.

OGL API/usage reference: [official README](https://github.com/oframe/ogl#usage).
The earlier [pre-optimization comparison](./2026-09-09-ogl-comparison.md) remains
historical; its shooosh measurements included runtime translation and the old
scene dependency graph.
