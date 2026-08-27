# Documentation

WGSL-first site GPU. WebGPU when the browser can, WebGL2 when it can’t.

This folder is what [the GitHub repo](https://github.com/vallafederico/shooosh) should link to. The root [readme](../readme.md) is the short landing page; everything below is the focused set.

[npm](https://www.npmjs.com/package/shooosh) · [GitHub](https://github.com/vallafederico/shooosh) · [Roadmap](../ROADMAP.md)

## Start

| | |
| --- | --- |
| [Getting started](./getting-started.md) | Install, two mounts, first `fsMain` |
| [Examples](../examples/README.md) | Copy-paste site setups (hero, layer, post, Webflow, …) |
| [API](./api.md) | What to call (`createScene`, `acquireLayer`, `createItem`, …) |
| [Shader contract](./shader-contract.md) | `fn fsMain`, `vUv`, `uUni`, backends, failure policy |

## Guides

| | |
| --- | --- |
| [Site patterns](./site-patterns.md) | App-shell canvas, items, post, Webflow — from aiuis |
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

Public API: [`package/index.ts`](../package/index.ts). Node/Bun generators: [`package/msdf/`](../package/msdf/).
