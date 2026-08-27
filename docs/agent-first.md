# Agent-first

[Documentation](./README.md)

How this repo is set up so a coding agent can pick it up, learn the product, and ship the next slice without inventing a scene API.

The model is [vgpu’s agent docs](https://vgpu.sh/agents.md) (`agents.md`, `llms.txt`, a `check` CLI). We stole the **documentation shape**, not tensors, Dawn, or `frame.pass`.

Until [task 06](./agent-tasks/06-agent-docs-hosting.md) hosts these files on the site, **this GitHub repo is the interface**.

## What landed

### 1. Machine index — [`/llms.txt`](../llms.txt)

A short, fetchable map. Agents read this first.

- When to use shooosh (and when not to)
- Which files to open — not `node_modules/` or `dist/`
- Current public API (browser + `shooosh/msdf`)
- Shader contract in one screen
- Skills and the numbered work queue

Same role as [vgpu.sh/llms.txt](https://vgpu.sh/llms.txt).

### 2. Readiness manifest — [`/agents.md`](../agents.md)

Product identity for an agent that has never seen the repo:

- Category, audience, shading language, runtime policy
- Conventions (zero browser deps, no `WebGL2RenderingContext` on new types, never blank the page)
- Out of scope (Three, Dawn-in-the-package, tensors, a `frame.pass` graph)
- How to pick work and how to verify (`bun test package`, `bun run bin/build.ts`)

Source of truth for the public API is [`package/index.ts`](../package/index.ts), not a guessed surface.

### 3. Executable queue — [`docs/agent-tasks/`](./agent-tasks/)

[ROADMAP.md](../ROADMAP.md) is direction. The tasks are the split an agent can finish in one run.

- Numbered briefs (`01` … `07`) with YAML `status: todo | done`
- Lowest unfinished number wins
- One task per run. Mark `done`, write a Done note, stop
- Task 01 (dual renderer) is done. 02–07 are still `todo`

### 4. Shader contract as spec

Agents should not write a full WGSL pipeline, invent GLSL-first, or require `frame.gl`.

- [shader-contract.md](./shader-contract.md) — `fn fsMain`, `vUv`, `uUni`, failure policy
- [shader-translation.md](./shader-translation.md) — WGSL ↔ GLSL 300 es
- Library converters: `convertWgslFragmentToGlsl` / `convertGlslFragmentToWgsl`

### 5. Cursor skills

Repeatable how-tos under [`.cursor/skills/`](../.cursor/skills/):

| Skill | When |
| --- | --- |
| `wgsl-to-glsl` / `glsl-to-wgsl` | Port a fragment |
| `shooosh-site` | Mount a page canvas / layer |
| `shooosh-item` | DOM-tracked quad |
| `shooosh-post` | bloom / grain / `applyEffect` |
| `shooosh-msdf` | Bake font/icon SDFs (Node/Bun) |

### 6. Always-on session rule

[`.cursor/rules/shooosh.mdc`](../.cursor/rules/shooosh.mdc) is `alwaysApply`. Every Cursor session is told: read `llms.txt` + `agents.md`, take the next `todo` task, author WGSL, don’t blank the page.

### 7. Site patterns from real usage

[site-patterns.md](./site-patterns.md) is copied from how we actually ship (aiuis `Canvas` / `GlItem`, Webflow IIFE, smooothy sliders) — not from a generic Three tutorial.

### 8. Source file headers

Every public module (and the internals an agent opens next) starts with a block comment: what the file is, **how to use it**, what not to do, and which doc to read. Start at [`package/index.ts`](../package/index.ts). Do not invent a second API because a file looked undocumented.

## How an agent starts

1. Read [`llms.txt`](../llms.txt)
2. Read [`agents.md`](../agents.md)
3. Open the lowest file in [`docs/agent-tasks/`](./agent-tasks/) whose front matter says `status: todo`
4. Do that task only
5. `bun test package` and `bun run bin/build.ts`

## Not yet (queued, not missing)

These are the vgpu pieces we have **not** cloned. They are tasks, not gaps to invent around.

| vgpu thing | shooosh status |
| --- | --- |
| Hosted `/agents.md` + `/llms.txt` | [Task 06](./agent-tasks/06-agent-docs-hosting.md) — repo copies stay source of truth |
| `check` CLI (shader validate, no browser) | [Task 05](./agent-tasks/05-check-cli.md) |
| Named uniforms, WGSL stdlib, HMR, compile overlay | Tasks 02–04, 07 |
| MCP / examples API | Out of scope for now |

## What we explicitly did not do

- No Dawn, tensors, or `frame.pass` scene graph
- No second public API besides `createScene` / `createItem` / `acquireLayer`
- Docs live in git so GitHub *is* the agent host until `/web` serves the same files
