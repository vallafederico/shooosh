# Changelog

All notable changes to [shooosh](https://www.npmjs.com/package/shooosh) are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [SemVer](https://semver.org/).

## [0.0.3] — 2026-08-28

Version bump; no API changes vs `0.0.2`.

## [0.0.2] — 2026-08-28

First release of the full dual-backend surface after the WebGPU-first merge.

### Added

- **WebGPU default, WebGL2 fallback** — same `createScene` / `createItem` / `acquireLayer` / `createObject` / `createParticles` / `createMsdfGlyphs` API on both backends; `probeRenderer()` reports which one won
- **`createCompute`** (WebGPU) — pipelines, ping-pong, frame hooks; fluid recipes live in `examples/`
- **Post stack** — fragment-only `createPostProcessor().addFragmentEffect({ fragmentShader, fragmentShaderWgsl })`; looks (bloom, FXAA, grain, bw) ship as WGSL in `examples/post-shaders.ts`
- **Textures** — `loadTexture`, `resolveTextureUvTransform` / `applyTextureUv` / `textureFitToUni`, optional `textureFit` on items (`cover` | `contain` | `fill`)
- **PBR / env maps** on `createObject` (both backends), GLB load via `loadGlb`
- **MSDF text + icon SDFs** — runtime glyphs + Node/Bun `shooosh/msdf` / `pnpm msdf`
- **Mouse trail** on both backends
- **Examples catalog** — plasma, noise, SDF, fluid, scroll, cards, textured planes/items, objects, particles, MSDF, post
- **Agent docs** — `llms.txt`, `agents.md`, `docs/`, Cursor skills (WGSL ↔ GLSL, site / item / post / MSDF / examples)

### Changed

- **WGSL-first** — author `fn fsMain() -> vec4f`; GLSL 300 es remains a WebGL2 escape hatch
- Public API slimmed: no named post presets (`effects.bloom` / `bw` / `noise` removed); no magic looks in the package
- Failed shader compile keeps the last good program and surfaces the log — never blanks the page

### Removed

- Package-level bloom / bw / noise post builtins (use example shaders instead)

## [0.0.1] — 2026-08-27

Initial publish: package name **`shooosh`**, ESM / CJS / IIFE builds, early WebGL2-oriented site mounts (`createScene`, `acquireLayer`, `createItem`), harness + docs scaffolding.

---

[0.0.3]: https://github.com/vallafederico/shooosh/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/vallafederico/shooosh/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/vallafederico/shooosh/releases/tag/v0.0.1
