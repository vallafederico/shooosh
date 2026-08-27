# shooosh

shooosh is a WGSL-first site GPU engine — WebGPU when the browser can, WebGL2 when it can’t. Same `createScene` / `createItem` / `acquireLayer` API on both backends.

This file is the agent readiness manifest (same role as [vgpu’s agents.md](https://vgpu.sh/agents.md)) and the repo working guide.

## Product context

- Category: Developer tools / site graphics
- Audience: Coding agents and people shipping marketing/product sites
- Shading language: **WGSL**. GLSL 300 es is a legacy escape hatch.
- Runtime policy: probe WebGPU → else WebGL2 → else `null` / readable page

Common use cases:

- Fullscreen fragment on a dedicated `<canvas>` (`createScene`)
- Shared page-behind canvas + DOM-tracked quads (`acquireLayer` + `createItem`)
- Post stack (`effects.bloom` / `bw` / `noise` / `custom`)
- Hot-swap a `.wgsl` file without remounting the scene (roadmap)

## Documentation surfaces

- [llms.txt](./llms.txt) — machine index. Start here.
- [docs/shader-contract.md](./docs/shader-contract.md) — authored language and uniforms
- [docs/shader-translation.md](./docs/shader-translation.md) — WGSL ↔ GLSL
- [docs/api.md](./docs/api.md) — public API after the dual renderer
- [docs/site-patterns.md](./docs/site-patterns.md) — aiuis / Webflow / slider recipes
- [ROADMAP.md](./ROADMAP.md) — product direction
- [docs/agent-tasks/](./docs/agent-tasks/) — executable briefs. Pick the lowest unfinished number
- [readme.md](./readme.md) — human install + short examples
- Source of truth for the public API: [package/index.ts](./package/index.ts)

Cursor skills (read when converting shaders):

- [wgsl-to-glsl](./.cursor/skills/wgsl-to-glsl/SKILL.md)
- [glsl-to-wgsl](./.cursor/skills/glsl-to-wgsl/SKILL.md)
- [shooosh-site](./.cursor/skills/shooosh-site/SKILL.md)
- [shooosh-item](./.cursor/skills/shooosh-item/SKILL.md)
- [shooosh-post](./.cursor/skills/shooosh-post/SKILL.md)

Page-level Markdown: this repo is the docs until `/web` ships hosted `llms.txt` / `agents.md`.

## Agent instructions

1. Read `llms.txt`, then this file, then the next file in `docs/agent-tasks/` whose status is `todo`.
2. Do **one** task per run. Mark it `done` in that file’s front matter when finished. Do not start the next task unless the current one is complete and tests pass.
3. Author new shaders in WGSL (`fsMain`). Do not add GLSL except as a fallback converter target or a site escape hatch. When porting shaders, read the `wgsl-to-glsl` / `glsl-to-wgsl` skills and prefer `convertWgslFragmentToGlsl` / `convertGlslFragmentToWgsl`.
4. Do not leak `WebGL2RenderingContext` into new public types. Shared frame types stay backend-agnostic.
5. Never blank the page on shader failure — keep the last good program, surface the log.
6. Out of scope: tensors, neural nets, Dawn-in-the-package, vgpu’s `frame.pass` graph.
7. Verify with `bun test package` and `bun run bin/build.ts`. For UI, use the Vite harness.

## Conventions

- Package source lives in `package/`. Root `package.json` is what npm publishes.
- Harness and web import source via alias (`shooosh` → `package/index.ts`).
- Zero runtime dependencies. Do not add Three, Dawn, or a GPU tensor stack.
- `acquireLayer()` / `probeRenderer()` returning `null` is valid. Callers no-op; the page stays readable.
- Do not commit `dist/`, `node_modules/`, `.env*`, or `.npmrc`.

## Repo map

| Path | What |
| --- | --- |
| `package/` | Published library source |
| `package/src/engine/` | async `createEngine` (WebGPU default, WebGL2 fallback), `probeRenderer` |
| `package/src/scene/` | `createScene` |
| `package/src/primitives/` | screen, item, object, particles, msdf |
| `package/src/post/` | bloom, bw, noise, custom |
| `package/src/shaders/` | compile, WGSL wrap, WGSL ↔ GLSL converters |
| `.cursor/skills/` | Agent skills: WGSL ↔ GLSL |
| `harness/` | Vite playground |
| `web/` | Astro landing |
| `bin/` | ESM / CJS / IIFE build + publish checks |
| `docs/` | Shader contract, translation, API summary |
| `docs/agent-tasks/` | Cloud-agent work queue |

## Links

- Source: https://github.com/vallafederico/shooosh
- npm: https://www.npmjs.com/package/shooosh
- DX reference (not a port): https://vgpu.sh/agents.md
