---
name: shooosh-examples
description: Copy a shooosh site setup from examples/. Use when the user wants a hero canvas, page-behind layer, app shell, post stack, mouse magnify, particles, Webflow embed, MSDF bake, or Solid/React wrappers.
---

# Copy a setup

Read [examples/README.md](../../../examples/README.md) and pick **one** file. Do not invent a second scene API.

| Need | File |
| --- | --- |
| Dedicated hero canvas | `examples/fullscreen-scene.ts` |
| Page-behind + DOM quads | `examples/page-layer.ts` |
| App layout / SSR canvas | `examples/app-shell.ts` |
| Bloom + grain | `examples/post-stack.ts` (WebGL2) |
| Pointer magnify | `examples/mouse-magnify.ts` (WebGL2) |
| Dot grid | `examples/particle-grid.ts` (WebGL2) |
| Webflow / no bundler | `examples/webflow-embed.html` |
| Bake font/icon SDFs | `examples/bake-msdf.ts` (Node) |
| Solid / React lifecycle | `examples/framework-wrappers.ts` |

## Always

- Author WGSL `fn fsMain`. Post custom uses `applyEffect`, not `fsMain`.
- `acquireLayer()` may return `null` — leave the page readable.
- Pair acquire with `releaseLayer()`. `scene.destroy()` / `item.destroy()` on teardown.
- Do not import `shooosh/msdf` from the site bundle.
- Do not add Three or require `frame.gl`.
