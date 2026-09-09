# Changelog

All notable changes to [shooosh](https://www.npmjs.com/package/shooosh) are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [SemVer](https://semver.org/).

## [0.0.6] — 2026-09-09

### Added

- Rapier physics examples for piles, pendulums and 3D rigid bodies, with copy guides.
- Optional `shooosh/utils` transform and camera helpers, plus object position updates.
- Reproducible bundle audits and README size comparisons against OGL and Three.js,
  covering WebGL2, WebGPU and all published shooosh build formats.
- Backend-only `shooosh/webgl2` and `shooosh/webgpu` entries with matching DOM entries
  and shader targets; default remains dual-backend.
- Lightweight `createCanvasScene` with explicit resource cleanup via `retain`.
  Existing full scene conveniences remain available through `createScene`.
- Production shader comment/whitespace minification and a Bun `.wgsl` transform.
  Example shaders now use build imports, including generated fabric variants.
- Build-time WGSL fragment artifacts through `shooosh/build`, a Vite/Rollup plugin
  and the `shooosh-shader` CLI. Built-in DOM image and gradient shaders are precompiled.
- Explicit optional `shooosh/compiler` for dynamic shader strings and conversion tools.

### Changed

- **Migration required:** runtime renderers no longer translate WGSL into GLSL.
  Supply prepared shader pairs for WebGL2 or explicitly call `compileShader`.
  Converters moved out of the root export. See [shader migration](./docs/shader-build.md).


## [0.0.5] — 2026-09-08

### Added

- Optional `shooosh/dom` entry for cached DOM shader bindings and image enhancement,
  explicit engine ownership, native fallback, and shared image resource cleanup.
- Optional `shooosh/utility` entry with renderer-independent drag rotation and
  release inertia through `createSpinner`.
- Refractive glass example with drag interaction and a procedural backdrop.
- **WIP** fabric/sheen, subsurface scattering and screen-space ambient occlusion
  demos, marked experimental in the gallery and guides. SSS and SSAO require
  WebGPU; WebGL2 shows an explicit fallback.
- DOM integration lab with a real-input-backed canvas painting prototype. The
  input remains source-only and is not a public HTML capture or input mirror API.
- Production runtime and published-package smoke harnesses, consumer bundle
  budgets under Bun and Vite, and material shader/isolation checks.
- Agent copy guide covering dependencies, mount targets, backend limits and
  cleanup, with updated agent entry points and setup documentation.

### Fixed

- Unused primitive factories disappear from consumer bundles. Minified ESM/CJS
  preserve purity annotations; package side-effect metadata retains intentional
  global initialization. The measured capability-probe fixture is 93% smaller.
- DOM bindings sample nested scroll offsets during rendering without repeatedly
  measuring element bounds.
- Unchanged DOM maintenance scans no longer wake rendering. Changed CSS, sources,
  geometry, clipping ancestry and ordering still invalidate the adapter.
- The input prototype caches geometry, reuses bitmap allocations and schedules
  caret transitions instead of polling every 100 ms. Offscreen caret work pauses;
  low-frequency layout/font repair detects CSSOM changes.
- WebGPU items use an explicit bind layout so fragments that do not read uniforms
  can render correctly.

## [0.0.4] — 2026-08-31

### Fixed

- WebGL `loadTexture` no longer flips canvases and MSDF atlases by default (decode-time `flipY` regressed vs the old ignored `UNPACK_FLIP_Y` path).

### Added

- [`examples/fxaa.ts`](examples/fxaa.ts) — standalone FXAA harness demo (`?demo=fxaa`).

## [0.0.3] — 2026-08-28

Version bump; no API changes vs `0.0.2`.

## [0.0.2] — 2026-08-28

First release of the full dual-backend surface after the WebGPU-first merge.

### Added

- **WebGPU default, WebGL2 fallback** — same `createScene` / `createItem` / `acquireLayer` / `createObject` / `createParticles` / `createMsdfGlyphs` API on both backends; `probeRenderer()` reports which one won
- **`createCompute`** (WebGPU) — pipelines, ping-pong, frame hooks; fluid recipes live in `examples/`
- **Post stack** — fragment-only `createPostProcessor().addFragmentEffect({ fragmentShader, fragmentShaderWgsl })`; looks (bloom, FXAA, grain) ship in `examples/post-shaders.ts`
- **Textures** — `loadTexture`, `resolveTextureUvTransform` / `applyTextureUv` / `textureFitToUni`, optional `textureFit` on items (`cover` | `contain` | `fill`)
- **PBR / env maps** on `createObject` (both backends), GLB load via `loadGlb`
- **MSDF text + icon SDFs** — runtime glyphs + Node/Bun `shooosh/msdf` / `pnpm msdf`
- **Mouse trail** on both backends
- **Examples catalog** — plasma, noise, SDF, fluid, scroll, cards, textured planes/items, objects, particles, MSDF, post
- **Agent docs** — `llms.txt`, `agents.md`, `docs/`, Cursor skills (WGSL ↔ GLSL, site / item / post / MSDF / examples)

### Changed

- **WGSL-first** — author `fn fsMain() -> vec4f`; GLSL 300 es remains a WebGL2 escape hatch
- Public API slimmed: no named post presets (`effects.bloom` / `noise` removed); no magic looks in the package
- Failed shader compile keeps the last good program and surfaces the log — never blanks the page

### Removed

- Package-level bloom / noise post builtins (use example shaders instead)

## [0.0.1] — 2026-08-27

Initial publish: package name **`shooosh`**, ESM / CJS / IIFE builds, early WebGL2-oriented site mounts (`createScene`, `acquireLayer`, `createItem`), harness + docs scaffolding.

---

[0.0.5]: https://github.com/vallafederico/shooosh/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/vallafederico/shooosh/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/vallafederico/shooosh/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/vallafederico/shooosh/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/vallafederico/shooosh/releases/tag/v0.0.1
