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
- Post stack (`createPostProcessor` + example-owned `applyEffect` GLSL — see `examples/post-shaders.ts`)
- WebGPU compute (`createCompute`); fluids as example shaders + loop (`examples/fluid-sim.ts` / `fluid-shaders.ts`)
- Hot-swap a `.wgsl` file without remounting the scene (roadmap)

## DOM, SVG and text work

Start with [the agent rendering workflow](./docs/agent-dom-rendering.md), then
[DOM API](./docs/dom.md) and [MSDF generation](./docs/msdf.md) as needed. Preserve
native HTML semantics and supplied site styling. `scan()` registers marked
bindings; it is not arbitrary HTML capture. `dom.input()` is not a public API.
Use prepared WGSL/GLSL pairs for custom shaders and `{ data: true }` for standalone
SDF/MSDF uploads. Never hide native content before a successful GPU draw.
Verify both backends with the rendering regression harness; its exact commands
and failure cases are in the workflow guide. Run package tests before the build,
not concurrently with it. Keep optional DOM/text/tooling out of core imports.

## Using the optional model and rig APIs

For consumer tasks, start with [docs/agent-usage.md](./docs/agent-usage.md).
`shooosh-model/node` owns model/texture conversion, verification and extraction;
`shooosh-model/shooosh` loads prepared rigid geometry in browsers. `shooosh/rig`
provides separate bone/pose/sampling/socket/palette utilities, with no renderer
or clock. See [the model reference](./packages/model/README.md) and
[rig API](./docs/rig.md). Never move Node codecs or rig exports into core.

Inspect the installed exports/declarations and CLI help: these additions are
unreleased, and repository examples may need a newer build than npm. Root
packages ship this manifest, `llms.txt` and `docs/`; examples, skills, source and
private model assets require a matching checkout. The model package ships its
own [machine index](./packages/model/llms.txt) and [agent guide](./packages/model/agents.md).

Use [rig-bones](./examples/rig-bones.md) for bone/clip/socket integration and
[car-pbr](./examples/car-pbr.md) for a static textured material studio. The rigid
workbench does not deform skinned meshes or play animation clips. Generating a
skin palette is not renderer integration. Preserve attribution and verify both
backends for visual changes. See [bundle checks](./docs/audits/2026-09-09-final-tree-shaking.md).

## Documentation surfaces

- [llms.txt](./llms.txt) — machine index (**start here**)
- [examples/](./examples/README.md) — copy a look (demos start here)
- [docs/getting-started.md](./docs/getting-started.md) — install + two mounts
- [docs/shader-contract.md](./docs/shader-contract.md) · [docs/api.md](./docs/api.md) · [docs/site-patterns.md](./docs/site-patterns.md)
- [docs/msdf.md](./docs/msdf.md) · [ROADMAP.md](./ROADMAP.md) · [docs/agent-tasks/](./docs/agent-tasks/)
- [docs/README.md](./docs/README.md) — human docs hub
- Public API source of truth: [package/index.ts](./package/index.ts), [DOM entry](./package/dom/index.ts), [utility entry](./package/utility/index.ts)

### Agent interface (short)

This repo *is* the agent interface until hosted docs (task 06). Index = `llms.txt`. Working rules = this file. Looks = `examples/`; [agent copy guide](./examples/agent-guide.md) lists the complete copy sets, mount targets and limits. Engine work = next `docs/agent-tasks/` with `status: todo`. Do not invent named post presets — copy `examples/post-shaders.ts`.

GPU simulation skills: [compute → WebGL2 GPGPU](./.agents/skills/shooosh-gpgpu/SKILL.md) · [validation](./.agents/skills/shooosh-gpgpu-validation/SKILL.md). See [fallback guide](./docs/gpgpu-fallbacks.md).

Cursor skills (read when converting shaders):

- [wgsl-to-glsl](./.cursor/skills/wgsl-to-glsl/SKILL.md)
- [glsl-to-wgsl](./.cursor/skills/glsl-to-wgsl/SKILL.md)
- [shooosh-site](./.cursor/skills/shooosh-site/SKILL.md)
- [shooosh-item](./.cursor/skills/shooosh-item/SKILL.md)
- [shooosh-post](./.cursor/skills/shooosh-post/SKILL.md)
- [shooosh-msdf](./.cursor/skills/shooosh-msdf/SKILL.md)
- [shooosh-examples](./.cursor/skills/shooosh-examples/SKILL.md)

Page-level Markdown: this repo is the docs until `/web` ships hosted `llms.txt` / `agents.md`.

## Agent instructions

1. **Ship a look:** `llms.txt` → `examples/README.md` → copy one example. **Change the engine:** `llms.txt` → this file → next `docs/agent-tasks/` with `status: todo`.
2. Do **one** engine task per run. Mark it `done` in that file’s front matter when finished. Do not start the next task unless the current one is complete and tests pass.
3. Author new shaders in WGSL (`fsMain`). Looks (bloom/FXAA/grain/PBR/fluids) live in `examples/` — not package presets. When porting shaders, read the `wgsl-to-glsl` / `glsl-to-wgsl` skills.
4. Do not leak `WebGL2RenderingContext` into new public types. Shared frame types stay backend-agnostic.
5. Never blank the page on shader failure — keep the last good program, surface the log.
6. Out of scope: tensors, neural nets, Dawn-in-the-package, vgpu’s `frame.pass` graph.
7. Verify with `bun test package` and `bun run bin/build.ts`. For UI, use the Vite harness.

## Build-time work and experiment isolation

- Perform parsing, conversion, shader translation, asset packing and other input-independent work at build time. Runtime should load prepared data and perform only necessary input-dependent updates and draws.
- Treat bundle size as a constraint: keep optional code out of core imports and verify consumer bundle budgets.
- Put exploratory renderers and benchmarks in the private `experiment/` workspace, with separate builds and assets. Production library, web, examples and harness must not import it.
- Run `bun bin/check-experiment-isolation.ts` when changing package boundaries; promoting an experiment to a public API requires explicit scope and bundle review.

## Conventions

- Package source lives in `package/`. Root `package.json` is what npm publishes. File-level headers on those modules are agent docs — read them before inventing an API.
- Harness and web import source via alias (`shooosh` → `package/index.ts`).
- Zero runtime dependencies on the **browser** entry. Do not add Three, Dawn, or a GPU tensor stack.
- `shooosh/msdf` is Node/Bun only (`package/msdf/`). Do not import it from `package/index.ts`. Optional deps: `sharp`, `msdf-bmfont-xml`.
- `acquireLayer()` / `probeRenderer()` returning `null` is valid. Callers no-op; the page stays readable.
- Do not commit `dist/`, `node_modules/`, `.env*`, or `.npmrc`.

## Repo map

| Path | What |
| --- | --- |
| `package/` | Published library source |
| `package/msdf/` | Node/Bun SDF generators (`shooosh/msdf`) — not the browser entry |
| `package/src/engine/` | async `createEngine` (WebGPU default, WebGL2 fallback), `probeRenderer` |
| `package/src/scene/` | `createScene` |
| `package/src/primitives/` | screen, item, object, particles, msdf |
| `package/src/post/` | `createPostProcessor` + `effects.custom` sugar (looks in examples/) |
| `package/src/compute/` | `createCompute` (WebGPU) |
| `package/src/shaders/` | compile, WGSL wrap, WGSL ↔ GLSL converters |
| `examples/` | Copy-paste looks + recipes (fluid-sim, post-shaders, scroll, …) |
| `.cursor/skills/` | Agent skills: WGSL ↔ GLSL, site, item, post, examples, MSDF |
| `harness/` | Vite playground |
| `web/` | Astro landing |
| `bin/` | ESM / CJS / IIFE / `shooosh/msdf` build + `msdf` CLI + publish checks |
| `docs/` | Documentation hub (GitHub link target) |
| `docs/agent-tasks/` | Cloud-agent work queue |

## Links

- Source: https://github.com/vallafederico/shooosh
- npm: https://www.npmjs.com/package/shooosh
- DX reference (not a port): https://vgpu.sh/agents.md

Hosted docs: [agent manifest](https://shooosh-web.vercel.app/agents.md) · [machine index](https://shooosh-web.vercel.app/llms.txt) · [interactive examples](https://shooosh-web.vercel.app/examples).
