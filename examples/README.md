# Examples

Each file **uses shooosh** for a common shader look — `createScene`, `createItem`, `createPostProcessor`, `createCompute`, `createMouseMonad`. Looks and recipes live here (shaders + loops), not as package presets.

Author **WGSL `fn fsMain`**. Open a file, copy the mount block and the fragment. The harness (`pnpm --filter harness dev`) runs the same `run()` functions.

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
| [grain-bloom.ts](./grain-bloom.ts) | `createPostProcessor` + [post-shaders](./post-shaders.ts) | Emissive core + bloom / FXAA / grain (GLSL + WGSL) |
| [textured-plane.ts](./textured-plane.ts) | `createScene` + `loadTexture` | Procedural atlas; sample `fitUv(vUv)` |
| [textured-item.ts](./textured-item.ts) | `acquireLayer` + `createItem` + `loadTexture` | Shared texture on DOM cards (`fitUv`) |
| [object-spin.ts](./object-spin.ts) | `createObject` | Rounded box + lit WGSL, spinning |
| [object-env.ts](./object-env.ts) | `createObject` + `loadTexture(..., { flipY: false })` | Cube sampling `uEnvMap` |
| [object-pbr.ts](./object-pbr.ts) | `createObject` + [pbr-shaders](./pbr-shaders.ts) | Cook–Torrance GGX + env IBL (3 materials) |
| [object-mesh.ts](./object-mesh.ts) | `createObject` custom shape | Icosahedron — same packing as `loadGlb` |
| [particles-field.ts](./particles-field.ts) | `createParticles` | Animated clip-space dots |
| [item-fill.ts](./item-fill.ts) | `acquireLayer` + `createItem` | SDF capsule in the element's `vUv` |
| [msdf-text.ts](./msdf-text.ts) | `createMsdfGlyphs` + [make-sdf](./make-sdf.ts) | Atlas text (bake fonts with `shooosh/msdf`) |
| [sdf-icons.ts](./sdf-icons.ts) | `createItem` + `loadTexture` | Transparent SDF icons ([assets/icons](./assets/icons/) SVGs) |
| [fluid-pointer.ts](./fluid-pointer.ts) | `createCompute` + [fluid-sim](./fluid-sim.ts) / [fluid-shaders](./fluid-shaders.ts) | WebGPU fluids — pointer forces |
| [fluid-ambient.ts](./fluid-ambient.ts) | same | WebGPU fluids — ambient forces |
| [scroll-cards.ts](./scroll-cards.ts) | `acquireLayer` + `createItem` | Tall page; planes stick while scrolling |
| [scroll-sections.ts](./scroll-sections.ts) | `acquireLayer` + `createItem` | Full-width bands track through scroll |

Shared (not demos — imported by demos):

| File | Role |
| --- | --- |
| [fluid-sim.ts](./fluid-sim.ts) | Stable Fluids pass loop on `createCompute` |
| [fluid-shaders.ts](./fluid-shaders.ts) | Fluid WGSL (advect, splat, display, …) |
| [post-shaders.ts](./post-shaders.ts) | Bloom + FXAA + grain `applyEffect` GLSL + WGSL |
| [make-texture.ts](./make-texture.ts) | Procedural canvases for `loadTexture` (use `{ flipY: false }` for env) |
| [pbr-shaders.ts](./pbr-shaders.ts) | Cook–Torrance GGX `fsMain` for `createObject` |
| [make-sdf.ts](./make-sdf.ts) | Browser EDT + demo font/icon atlases (same encoding as `shooosh/msdf`) |

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

Fluid (WebGPU):

```js
import { createScene, createCompute } from "shooosh"
import { createFluidSim } from "./fluid-sim"
import { fluidShaders } from "./fluid-shaders"

const scene = createScene(canvas, { backend: "webgpu" })
await scene.getInitPromise()
const gpu = createCompute(scene.getEngine())
const fluid = createFluidSim(gpu, { shaders: fluidShaders, simScale: 0.5 })
fluid?.splat({ x: 0.5, y: 0.5, dx: 40, dy: -10, color: [0.85, 1, 0.25], radius: 0.02 })
```

Or call the example's `run`:

```js
import { run } from "./plasma"

const handle = run(canvas)
// handle.destroy()
```

Mount recipes (Webflow, SSR shell, MSDF bake) live in [setups/](./setups/README.md).

Docs: [shader contract](../docs/shader-contract.md) · [site patterns](../docs/site-patterns.md) · skill `shooosh-examples`.
