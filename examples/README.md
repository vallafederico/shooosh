# Examples

Each file **uses shooosh** for a common shader look — `createScene`, `createItem`, `effects`, `createMouseMonad`. Not mount stubs. Not fragment-only catalogs.

Author **WGSL `fn fsMain`**. Open a file, copy the `createScene` / `acquireLayer` block and the fragment. The harness (`pnpm --filter harness dev`) runs the same `run()` functions.

| File | Uses | What it draws |
| --- | --- | --- |
| [gradient.ts](./gradient.ts) | `createScene` | UV gradient + timed brand stripe |
| [plasma.ts](./plasma.ts) | `createScene` | Polar sines — classic hero |
| [value-noise.ts](./value-noise.ts) | `createScene` | Hash → value noise → fbm |
| [sdf-rings.ts](./sdf-rings.ts) | `createScene` | Signed circle, concentric pulses |
| [domain-warp.ts](./domain-warp.ts) | `createScene` | Noise-warped UVs (marble / liquid) |
| [grid.ts](./grid.ts) | `createScene` | Graph-paper field |
| [mouse-light.ts](./mouse-light.ts) | `createScene` + `createMouseMonad` | Pointer spotlight + ripples |
| [mouse-magnify.ts](./mouse-magnify.ts) | `createScene` + `createMouseMonad` | Lens zoom around the cursor |
| [grain-bloom.ts](./grain-bloom.ts) | `createScene` + `effects.bloom` / `noise` | Emissive core + post (WebGL2) |
| [item-fill.ts](./item-fill.ts) | `acquireLayer` + `createItem` | SDF capsule in the element's `vUv` |

Uniforms: `value1` = seconds. Pointer examples write `value2`/`value3` as 0..1 top-origin UV (remap from `createMouseMonad`'s −1..1). Same space as `vUv`.

Copy a look onto a canvas:

```js
import { createScene } from "shooosh"
import { fragment } from "./plasma"

createScene(canvas, {
  screen: {
    shaders: { fragment },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  },
})
```

Or call the example's `run`:

```js
import { run } from "./plasma"

const handle = run(canvas)
// handle.destroy()
```

Mount recipes (Webflow, SSR shell, MSDF bake) live in [setups/](./setups/README.md).

Docs: [shader contract](../docs/shader-contract.md) · [site patterns](../docs/site-patterns.md) · skill `shooosh-examples`.
