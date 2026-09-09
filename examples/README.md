# Examples


**Unreleased shader setup:** copy the recipe's `.wgsl` imports and enable
`shoooshShaders` from `shooosh/build`. Live examples use prepared shader data and
`createCanvasScene` where appropriate. See [bundle setups](../docs/bundle-setup.md).

Each file **uses shooosh** for a common shader look — `createScene`, `createItem`, `createPostProcessor`, `createCompute`, `createMouseMonad`. Looks and recipes live here (shaders + loops), not as package presets.

Start with the [agent copy guide](./agent-guide.md): exact files to copy, mount targets,
backend limits, cleanup and verification for every catalog entry. Author **WGSL
`fn fsMain`**. The harness (`pnpm --filter harness dev`) runs the same `run()` functions.
These are repository recipes, not exports from the npm package.
**WIP** entries are experimental: fabric/sheen, SSS and SSAO. They participate in
bundle and runtime checks but are not marked production-ready.

| File | Uses | What it draws |
| --- | --- | --- |
| [sss.ts](./sss.ts) **WIP** | `createEngine` + `createCompute` | Separable diffuse scattering, sharp specular, debug views; WebGPU ([guide](./screen-space-effects.md)) |
| [ssao.ts](./ssao.ts) **WIP** | `createEngine` + `createCompute` | Half-resolution depth-based AO, bilateral denoise and upsampling; WebGPU ([guide](./screen-space-effects.md)) |
| [gradient.ts](./gradient.ts) | `createScene` | UV gradient + timed brand stripe |
| [raymarch-clouds.ts](./raymarch-clouds.ts) | `createCanvasScene` | Fly through volumetric clouds with sun shadowing ([guide](./raymarching.md)) |
| [raymarch-lights.ts](./raymarch-lights.ts) | `createCanvasScene` | Sphere-traced sphere/torus, moving colored lights, soft shadows and AO ([guide](./raymarching.md)) |
| [plasma.ts](./plasma.ts) | `createScene` | Polar sines — classic hero |
| [value-noise.ts](./value-noise.ts) | `createScene` | Hash → value noise → fbm |
| [sdf-rings.ts](./sdf-rings.ts) | `createScene` | Signed circle, concentric pulses |
| [domain-warp.ts](./domain-warp.ts) | `createScene` | Noise-warped UVs (marble / liquid) |
| [grid.ts](./grid.ts) | `createScene` | Graph-paper field |
| [mouse-light.ts](./mouse-light.ts) | `createScene` + `createMouseMonad` | Pointer spotlight + ripples |
| [mouse-magnify.ts](./mouse-magnify.ts) | `createScene` + `createMouseMonad` | Lens zoom around the cursor |
| [refractive-glass.ts](./refractive-glass.ts) | `createScene` + `createSpinner` (`shooosh/utility`) | Transparent glass with drag-to-spin, bevel refraction, chromatic edges and pointer reflections over an example-owned backdrop |
| [grain-bloom.ts](./grain-bloom.ts) | `createPostProcessor` + [post-shaders](./post-shaders.ts) | Emissive core + bloom / FXAA / grain (GLSL + WGSL) |
| [fxaa.ts](./fxaa.ts) | `createPostProcessor` + [post-shaders](./post-shaders.ts) | FXAA-only pass on a hard-step aliased core |
| [textured-plane.ts](./textured-plane.ts) | `createScene` + `loadTexture` | Procedural atlas; sample `fitUv(vUv)` |
| [textured-item.ts](./textured-item.ts) | `acquireLayer` + `createItem` + `loadTexture` | Shared texture on DOM cards (`fitUv`) |
| [dom-integration.ts](./dom-integration.ts) | `shooosh/dom` · `createDomLayer` + `media` | Interactive lab: native/GPU comparison, image shaders, nested clipping, fallback and lifecycle checks |
| [physics-3d.ts](./physics-3d.ts) | Rapier 3D + `createObject` | Tumbling cubes, tray collisions and torque; full 3D transforms ([guide](./physics.md)) |
| [physics-pile.ts](./physics-pile.ts) | Rapier 2D + `createObject` | Falling blocks, collisions, sleeping and impulses ([guide](./physics.md)) |
| [physics-pendulum.ts](./physics-pendulum.ts) | Rapier 2D + `createObject` | Four revolute joints, damping and impulses ([guide](./physics.md)) |
| [object-spin.ts](./object-spin.ts) | `createObject` | Rounded box + lit WGSL, spinning |
| [object-env.ts](./object-env.ts) | `createObject` + `loadTexture(..., { flipY: false })` | Cube sampling `uEnvMap` |
| [fabric-sheen.ts](./fabric-sheen.ts) **WIP** | `createObject` + independent WGSL material helpers | Static diffuse/sheen/coat comparison; [controls and copy guide](./fabric-sheen.md) |
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

[Fabric material helpers](./materials/fabric.ts), [sheen](./materials/sheen.ts) and
[clearcoat](./materials/clearcoat.ts) are separately imported WGSL components.

[SSS and SSAO pass-by-pass guide](./screen-space-effects.md) includes shader bindings,
copy sets, limits and performance accounting. These two labs currently require WebGPU.

Shared (not demos — imported by demos):

| File | Role |
| --- | --- |
| [handle.ts](./handle.ts) · [types.ts](./types.ts) | Shared `run` lifecycle contract; copy when imported |
| [dom-canvas-input.ts](./dom-canvas-input.ts) | Source-only input prototype; imports package internals |
| [catalog.ts](./catalog.ts) · [index.ts](./index.ts) · [mount.ts](./mount.ts) | Gallery discovery and host markup; not needed for a single look |
| [fluid-sim.ts](./fluid-sim.ts) | Stable Fluids pass loop on `createCompute` |
| [fluid-shaders.ts](./fluid-shaders.ts) | Fluid WGSL (advect, splat, display, …) |
| [post-shaders.ts](./post-shaders.ts) | Bloom + FXAA + grain `applyEffect` GLSL + WGSL |
| [make-texture.ts](./make-texture.ts) | Procedural canvases for `loadTexture` (use `{ flipY: false }` for env) |
| [dom-integration-art.ts](./dom-integration-art.ts) · [dom-integration-style.ts](./dom-integration-style.ts) | Local poster assets and scoped layout for the DOM integration lab |
| [pbr-shaders.ts](./pbr-shaders.ts) | Cook–Torrance GGX `fsMain` for `createObject` |
| [make-sdf.ts](./make-sdf.ts) | Browser EDT + demo font/icon atlases (same encoding as `shooosh/msdf`) |

Uniforms are defined by each example’s `run` and shader, not a universal convention.
Most animated examples use `value1` = seconds. Pointer examples write `value2`/`value3` as 0..1 top-origin UV (remap from `createMouseMonad`'s −1..1). Same space as `vUv`. Exceptions include DOM shader mix, post-effect parameters,
MSDF dimensions and glass rotation/aspect; see the [copy guide](./agent-guide.md).

Copy a look onto a canvas:

```js
import { createScene } from "shooosh"
import { fragment } from "./plasma"

const scene = createScene(canvas, {
  screen: {
    shaders: { fragment },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  },
})
```

Call `scene.destroy()` on teardown. Give the canvas a nonzero CSS size; mount on
the client and handle initialization errors (see the copy guide).

Fluid (WebGPU, inside an async client mount):

```js
import { createScene, createCompute } from "shooosh"
import { createFluidSim } from "./fluid-sim"
import { fluidShaders } from "./fluid-shaders"

const scene = createScene(canvas, { backend: "webgpu" })
await scene.getInitPromise()
const engine = scene.getEngine()
const gpu = engine ? createCompute(engine) : null
const fluid = gpu ? createFluidSim(gpu, { shaders: fluidShaders, simScale: 0.5 }) : null
fluid?.splat({ x: 0.5, y: 0.5, dx: 40, dy: -10, color: [0.85, 1, 0.25], radius: 0.02 })
// Return this from the mount and call it on teardown:
const destroy = () => { fluid?.destroy(); gpu?.destroy(); scene.destroy() }
```

Or call the example's `run`:

```js
import { run } from "./plasma"

const handle = run(canvas)
// handle.destroy()
```

Mount recipes (Webflow, SSR shell, MSDF bake) live in [setups/](./setups/README.md).

Open `/?demo=dom-integration` in the harness for the DOM integration lab. Use the
backend selector to compare WebGPU and WebGL2, or the lab’s DOM button to restore
native image painting. The **Make it yours** panel adds a GPU-painted rounded
input backed by a real HTML input, keyboard submission, native SVG buttons,
a save toggle and reset. [dom-canvas-input.ts](./dom-canvas-input.ts) mirrors its
text, selection, caret and pencil into a dynamic texture; shader mix affects the
field itself. This is an authored LTR prototype using internal engine seams,
not arbitrary HTML capture or a public `shooosh/dom` input API. IME composition
and RTL text use native paint. Its state
survives adapter remounts; it is local to the example. **Run checks** exercises activation, CSS fallback,
measurement caching, disposal and remounting. To embed the lab in another host in this source checkout, keep
its helper files and internal imports and call `run(host, { backend: "auto" })` on a host with an explicit
height; call the returned `destroy()` when removing it. The lab uses `value1` for
shader mix rather than time.

Docs: [shader contract](../docs/shader-contract.md) · [site patterns](../docs/site-patterns.md) · skill `shooosh-examples`.

Run only the three WIP runtime scenarios with `/perf.html?backend=webgpu&scenario=wip`
(or `backend=webgl2`). An undisturbed WIP idle scenario now fails if it continues
rendering after warm-up. These labels do not exempt the demos from bundle budgets.

Performance audit: `/perf.html?backend=webgpu&scenario=physics` checks the three
physics recipes while active, paused and asleep. `scenario=baseline` covers the
existing engine/DOM/input paths. Repeat with `backend=webgl2`; see the
[measured audit](../docs/audits/2026-09-09-physics-utils-performance.md).
