---
name: shooosh-examples
description: Copy a shooosh example that uses the library for a common shader look (plasma, noise, SDF, domain warp, mouse light, bloom, cards). Use when the user wants a common site-GPU look or a Webflow/SSR shell.
---

# Copy an example

Read [examples/README.md](../../../examples/README.md). Prefer a **file that imports shooosh** from that table, not a new scene API.

| Look | File | API |
| --- | --- | --- |
| UV gradient + stripe | `examples/gradient.ts` | `createScene` |
| Polar hero | `examples/plasma.ts` | `createScene` |
| Grain / fog / paper | `examples/value-noise.ts` | `createScene` |
| Circle SDF / rings | `examples/sdf-rings.ts` | `createScene` |
| Marble / liquid warp | `examples/domain-warp.ts` | `createScene` |
| Graph paper | `examples/grid.ts` | `createScene` |
| Pointer spotlight | `examples/mouse-light.ts` | `createScene` + `createMouseMonad` |
| Pointer lens | `examples/mouse-magnify.ts` | `createScene` + `createMouseMonad` |
| Bloom + grain | `examples/grain-bloom.ts` | `createScene` + `effects.*` (WebGL2 post) |
| Card / DOM fill | `examples/item-fill.ts` | `acquireLayer` + `createItem` |

Mount-only (Webflow, bake, React/Solid): [examples/setups/](../../../examples/setups/README.md).

## Always

- Author WGSL `fn fsMain`. `value1` = seconds. Pointer UV = `value2`/`value3` (top-origin). `createMouseMonad` is −1..1 — remap with `m.x * 0.5 + 0.5`.
- Stay in the converter subset so WebGL2 can run it (`docs/shader-translation.md`).
- Post custom uses `applyEffect`, not `fsMain`.
- Do not import `shooosh/msdf` from the site bundle.
