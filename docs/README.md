# Documentation

WGSL-first site GPU. WebGPU when the browser can, WebGL2 when it can’t.

This folder is what [the GitHub repo](https://github.com/vallafederico/shooosh) should link to. The root [readme](../readme.md) is the short landing page; everything below is the focused set.

[npm](https://www.npmjs.com/package/shooosh) · [GitHub](https://github.com/vallafederico/shooosh) · [Changelog](../CHANGELOG.md) · [Roadmap](../ROADMAP.md)

## Start

| | |
| --- | --- |
| [Agent entry guide](./agent-usage.md) | Model/texture/rig workflows, exact imports, deployment artifacts and limits |
| [Getting started](./getting-started.md) | Install, two mounts, first `fsMain` |
| [Agent copy guide](../examples/agent-guide.md) | Per-demo dependencies, mount targets, backend limits and verification |
| [Examples](../examples/README.md) | Using the library: plasma, noise, SDF, mouse, bloom, fluid, scroll, cards |
| [API](./api.md) | What to call (`createScene`, `createCompute`, `acquireLayer`, `createItem`, …) |
| [Shader contract](./shader-contract.md) | `fn fsMain`, `vUv`, `uUni`, backends, failure policy |

## Guides

| | |
| --- | --- |
| [Site patterns](./site-patterns.md) | App-shell canvas, items, post, Webflow — from aiuis |
| [Rig and bone utilities](./rig.md) | Optional CPU poses, clip sampling, sockets and palettes |
| [Model and texture tools](https://github.com/vallafederico/shooosh/blob/main/packages/model/README.md) | Separate Node pipeline, typed parts, KTX2/WebP verification and local viewers |
| [Interaction utilities](./utility.md) | Optional `shooosh/utility`: drag rotation and inertia |
| [DOM integration](./dom.md) | Optional `shooosh/dom`: cached shader bindings and safe image enhancement |
| [WGSL ↔ GLSL](./shader-translation.md) | Fallback converter + mapping |
| [MSDF](./msdf.md) | Node/Bun font atlas + icon SDF (`shooosh/msdf`) |

## For coding agents

The repo is the agent interface until the site hosts the same files ([task 06](./agent-tasks/06-agent-docs-hosting.md)).

| | |
| --- | --- |
| [What we set up](./agent-first.md) | `llms.txt`, `agents.md`, tasks, skills, contract |
| [`/llms.txt`](../llms.txt) | Machine index — read this first |
| [`/agents.md`](../agents.md) | Readiness manifest and working rules |
| [Agent tasks](./agent-tasks/) | Numbered queue. Lowest `status: todo` wins |

Cursor skills: [wgsl-to-glsl](../.cursor/skills/wgsl-to-glsl/SKILL.md), [glsl-to-wgsl](../.cursor/skills/glsl-to-wgsl/SKILL.md), [shooosh-site](../.cursor/skills/shooosh-site/SKILL.md), [shooosh-item](../.cursor/skills/shooosh-item/SKILL.md), [shooosh-post](../.cursor/skills/shooosh-post/SKILL.md), [shooosh-msdf](../.cursor/skills/shooosh-msdf/SKILL.md), [shooosh-examples](../.cursor/skills/shooosh-examples/SKILL.md).

## Source of truth

Design proposal: [Optional DOM integration](./proposals/dom-integration.md) — DOMGL research, `shooosh/dom` module boundary, implemented foundation and proposed later stages.

Execution specification: [DOM mirroring gaps and agent plan](./proposals/dom-mirroring-delivery-plan.md)
— current audit findings, supported-scope targets, staged ownership and final
verification matrix. First queued stage: [task 11](./agent-tasks/11-dom-mirroring-hardening.md).

Measured audit: [Bundle size and browser performance](./audits/2026-09-08-lightweight-performance.md)
— consumer byte costs, WebGPU/WebGL2 operation counts, prioritized optimizations
and reproducible audit tools. Completed bundle task: [12](./agent-tasks/12-bundle-tree-shaking.md);
[results and regression gates](./audits/2026-09-08-tree-shaking-results.md).

Public API: [`package/index.ts`](../package/index.ts). Node/Bun generators: [`package/msdf/`](../package/msdf/).

Example follow-up: [bundle isolation and runtime checks](./audits/2026-09-08-examples-performance.md)
— direct/index imports, isolated spinner, idle glass and reduced caret scheduling.

Completed follow-up: [DOM idle optimization](./audits/2026-09-08-dom-idle-optimization.md)
— cached input geometry, change-aware maintenance and production browser evidence.

- [Build-time shaders and migration](./shader-build.md) — `.wgsl` plugin, CLI and optional runtime compiler.
- [Small bundle setups](./bundle-setup.md) — backend-only entries, lightweight scenes and production shaders.

- [Optional rig and bone utilities](./rig.md) — explicit poses, animation sampling and skin matrices; no renderer dependency.

- [GPGPU fallback guide](./gpgpu-fallbacks.md) — compute-to-WebGL2 conversion, reference examples and agent skills.
