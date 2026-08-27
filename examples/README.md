# Examples

Copy-paste setups from how we actually ship sites (aiuis, Webflow, sliders). **Not a scene graph.** Author WGSL `fn fsMain`. Imports are the public `shooosh` package — drop a file into a site and adjust the canvas / element.

Agents: read this table, then open the file. Each file starts with when to use it, which backend, and teardown.

| File | When | Backend |
| --- | --- | --- |
| [fullscreen-scene.ts](./fullscreen-scene.ts) | Section hero / dedicated canvas | WebGPU → WebGL2 |
| [page-layer.ts](./page-layer.ts) | Shared canvas behind the page + DOM quads | WebGPU → WebGL2 |
| [app-shell.ts](./app-shell.ts) | App layout owns one canvas (SSR-safe, aiuis `Canvas`) | WebGPU → WebGL2 |
| [post-stack.ts](./post-stack.ts) | Bloom + grain on a scene | WebGL2 (skipped on WebGPU) |
| [mouse-magnify.ts](./mouse-magnify.ts) | Custom post `applyEffect` + settle-loop idle | WebGL2 |
| [particle-grid.ts](./particle-grid.ts) | Clip-space dots | WebGL2 |
| [webflow-embed.html](./webflow-embed.html) | IIFE / Webflow embed | WebGPU → WebGL2 |
| [bake-msdf.ts](./bake-msdf.ts) | Node/Bun font + icon atlas bake | Node (not the site bundle) |
| [framework-wrappers.ts](./framework-wrappers.ts) | Solid / React mount shape | either |

Docs: [getting started](../docs/getting-started.md) · [site patterns](../docs/site-patterns.md) · [shader contract](../docs/shader-contract.md) · skill `shooosh-site` / `shooosh-item` / `shooosh-post` / `shooosh-msdf`.

Do not add Three. Do not require `frame.gl`. `acquireLayer()` returning `null` is valid.
