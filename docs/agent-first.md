# Agent-first

An agent should be able to find the right entry point, copy a complete recipe,
understand its limits and verify the result without guessing package APIs.

## Start from the task

| Task | Read in order |
| --- | --- |
| Import/optimize a model or texture | [Agent entry guide](./agent-usage.md) → [model reference](https://github.com/vallafederico/shooosh/blob/main/packages/model/README.md) |
| Use bones or imported animation | [Rig API](./rig.md) → [rig example](../examples/rig-bones.md); utilities do not deform meshes automatically |
| Add a visual look | [llms.txt](../llms.txt) → [example catalog](../examples/README.md) → [copy guide](../examples/agent-guide.md) → selected source and helpers |
| Bind DOM images to GPU effects | [DOM guide](./dom.md) → [DOM lab](../examples/dom-integration.ts); distinguish public image APIs from the input prototype |
| Add drag rotation | [Utility guide](./utility.md) → [glass recipe](../examples/refractive-glass.ts) |
| Change the engine | [agents.md](../agents.md) → applicable bounded [task brief](./agent-tasks/); honor the user's selected scope |
| Translate a shader | [Shader contract](./shader-contract.md) → [translation guide](./shader-translation.md) → relevant [skill](../llms.txt) |

The root index describes the public renderer API. Optional DOM and utility entries
have their own index files and documentation. `shooosh/msdf` is Node/Bun tooling;
never import it into a browser bundle. Examples own visual effects and simulation
recipes; their names are not package presets.

## What each example provides

The [copy guide](../examples/agent-guide.md) covers every catalog entry with
mount targets, local dependencies and backend exceptions. Source headers explain
the material or recipe; `run` contains initialization, parameter updates and
resource disposal. Read both. The harness mounts these same functions and adds
its own markup and controls.

An agent copying one look should import that module directly, preserve its helper
files, give its target an explicit size, handle asynchronous failure and register
cleanup. It should verify the rendered result, resizing, interaction and remounting
on both backends. A converter pass is not evidence of visual correctness.

## Keep the interface honest

- Public support belongs in API guides; proposed behavior belongs in task briefs.
  The DOM input mirror is explicitly a source-only prototype, not a shipped HTML
  rasterizer. Fluid simulation requires WebGPU even when an engine can use WebGL2.
- Every new catalog entry needs a README row, a copy-guide row, source usage notes,
  complete helper dependencies, uniform meanings, backend limits and cleanup.
- When adding a public subpath, update `llms.txt`, the docs hub and package exports.
  When changing a build contract, update the consumer checks and measured evidence.
- Keep fallback, accessibility and performance claims scoped to what was checked.
  Record remaining gaps in an actionable task or audit rather than hiding them in
  examples or claiming that every demo is production-ready.

## Distribution and verification

The next core package includes `llms.txt`, `agents.md` and `docs/`; the separate
model package includes its own machine index and agent guide. An npm install does
not include the example catalog, skills or all source paths linked here. Use a source
checkout matching the installed release; the working tree can contain unreleased
APIs. Hosted agent documentation remains [task 06](./agent-tasks/06-agent-docs-hosting.md).

Package changes require `bun test package` and `bun run bin/build.ts`; the latter
also checks published consumer bundles with Bun and Vite. UI changes use the Vite
harness. See the [tree-shaking results](./audits/2026-09-08-tree-shaking-results.md)
for reproducible size checks and their limits. Release remains a separate action
from documentation review.
