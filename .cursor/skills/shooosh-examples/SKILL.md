---
name: shooosh-examples
description: Copy a shooosh shader example (plasma, noise, SDF, domain warp, mouse light, bloom) or a mount setup. Use when the user wants a common site-GPU look or a Webflow/SSR shell.
---

# Copy an example

Read [examples/README.md](../../../examples/README.md). Prefer a **shader** from that table, not a new scene API.

| Look | File |
| --- | --- |
| UV gradient + stripe | `examples/gradient.ts` |
| Polar hero | `examples/plasma.ts` |
| Grain / fog / paper | `examples/value-noise.ts` |
| Circle SDF / rings | `examples/sdf-rings.ts` |
| Marble / liquid warp | `examples/domain-warp.ts` |
| Pointer spotlight | `examples/mouse-light.ts` |
| Bloom + grain | `examples/grain-bloom.ts` (WebGL2 post) |
| Card / DOM fill | `examples/item-fill.ts` |

Mount-only (Webflow, bake, React/Solid): [examples/setups/](../../../examples/setups/README.md).

## Always

- Author WGSL `fn fsMain`. `value1` = seconds. Pointer UV = `value2`/`value3` (top-origin).
- Stay in the converter subset so WebGL2 can run it (`docs/shader-translation.md`).
- Post custom uses `applyEffect`, not `fsMain`.
- Do not import `shooosh/msdf` from the site bundle.
