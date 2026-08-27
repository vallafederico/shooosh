# Examples

Real shaders on the public API — the common site-GPU pieces, not mount stubs.

Author **WGSL `fn fsMain`**. Each file is the fragment plus a one-line “when”. The harness (`pnpm --filter harness dev`) runs the same catalog.

| File | What it draws |
| --- | --- |
| [gradient.ts](./gradient.ts) | UV gradient + timed brand stripe |
| [plasma.ts](./plasma.ts) | Polar sines — classic hero |
| [value-noise.ts](./value-noise.ts) | Hash → value noise → fbm |
| [sdf-rings.ts](./sdf-rings.ts) | Signed circle, concentric pulses |
| [domain-warp.ts](./domain-warp.ts) | Noise-warped UVs (marble / liquid) |
| [mouse-light.ts](./mouse-light.ts) | Pointer spotlight + ripples (`value2`/`value3`) |
| [grain-bloom.ts](./grain-bloom.ts) | Emissive core + `effects.bloom` / `noise` (WebGL2) |
| [item-fill.ts](./item-fill.ts) | `createItem` SDF capsule in the element’s `vUv` |

`catalog.ts` lists them. `mount.ts` is how the harness (and you) turn a spec into `createScene` / `acquireLayer`.

Uniforms: `value1` = seconds. Pointer examples also write `value2`/`value3` as 0..1 top-origin UV — the same space as `vUv`.

Copy a fragment into a site:

```js
import { createScene } from "shooosh"
import { plasma } from "./plasma"

createScene(canvas, {
  screen: {
    shaders: { fragment: plasma.fragment },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  },
})
```

Mount recipes (Webflow, SSR shell, MSDF bake) live in [setups/](./setups/README.md).

Docs: [shader contract](../docs/shader-contract.md) · [site patterns](../docs/site-patterns.md) · skill `shooosh-examples`.
