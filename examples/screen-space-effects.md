# SSS and SSAO shader labs

**WIP:** experimental demos. Bundle and runtime checks cover integration; they do not establish production readiness or full visual correctness.

Two independent, WebGPU-only recipes using the public `createEngine` and
`createCompute` APIs. No engine primitives, package presets, scene graph, Three.js
or physics dependency are added. WebGL2 shows a readable unsupported message.

Open `/?demo=sss&backend=webgpu` or `/?demo=ssao&backend=webgpu` in the harness.
Controls include effect/baseline/split views, normals, depth, radius, strength,
light direction and camera orbit. SSAO adds 8/16 samples and half/full resolution.
SSS adds a slit-light pattern to make the diffusion of high-frequency lighting
visible. Both scenes are static until a control or canvas size changes.

## Copy and mount

Copy `sss.ts` + `sss-shaders.ts` **or** `ssao.ts` + `ssao-shaders.ts`, plus
`screen-space-scene.ts`, `screen-space-lab.ts`, and `types.ts` into one directory.
The selected wrapper imports only its own effect shaders. These modules use no
package internals. Use a package release that includes `createCompute`, or this
workspace while the examples are unreleased.

```html
<section style="position:relative;height:600px;min-width:320px">
  <canvas id="effect" style="display:block;width:100%;height:100%" aria-hidden="true"></canvas>
</section>
```

```ts
import { run } from './ssao' // or './sss'
const handle = run(document.querySelector<HTMLCanvasElement>('#effect')!, {
  backend: 'auto', onInitError: console.error,
})
void handle.ready?.then(backend => console.info('Renderer:', backend))
// Register this in the owning component's unmount hook:
const cleanup = () => handle.destroy()
```

The wrapper mounts native keyboard-operable controls in the canvas parent. It
removes those controls and disposes callbacks, textures, uniform buffer and engine
on teardown. Destruction while adapter initialization is pending is guarded.
`ready` indicates initialization, not a GPU-time benchmark or proof every pixel
is correct. Check the visible scene and browser validation logs.

## Shared scene preparation

A single 8×8 compute dispatch traces four analytic spheres and a floor. It writes
two full-resolution `rgba16float` textures:

| Texture | RGB | Alpha |
| --- | --- | --- |
| Diffuse | Linear lit material color, without specular | Exact material ID; 0 background, 1–4 spheres, 5 floor |
| Geometry | World-space unit surface normal | Distance along the camera ray; 0 background |

No normal/depth mesh redraw is required for this synthetic scene. The ray and
projection helpers share the same perspective camera and top-origin UV convention.
This scene isolates the effects without model downloads. It is **not** a generic
adapter that extracts buffers from arbitrary `createObject` scenes. Such an adapter
would need separately designed renderer plumbing. To use your own buffers, keep
the packing/coordinate contract and replace the scene dispatch and projection math.

## SSAO passes

1. **Geometry:** prepare the two textures once per invalidation.
2. **Occlusion:** at half resolution by default, reconstruct each sample position
   from its ray distance. Rotate an 8- or 16-sample hemisphere into the surface's
   tangent frame. Project sample positions into the depth buffer and compare their
   camera distances, using a bias and radius falloff. Skip offscreen/background
   samples. The result is visibility: 1 unoccluded, 0 fully occluded.
3. **Denoise:** a 3×3 filter weights neighbors by spatial distance, depth difference
   and normal agreement. Depth/normal edges retain sharp contact boundaries.
4. **Composite:** four-tap depth/normal-aware upsampling at display resolution,
   then `diffuse * visibility^strength`; specular is added afterward. Gamma encoding
   happens once, at the final display boundary.

Radius is in scene world units (0.05–1.5). Strength is an artistic exponent
(0–3). The sample loop has a fixed maximum of 16 and reads the selected count from
uniforms, so quality changes do not compile new shader variants. Changing
half/full resolution reallocates only the effect textures along with the current
simple resize implementation's other textures.

This takes its performance direction from [N8AO](https://github.com/N8python/n8ao):
small sample counts, lower resolution and edge-aware reconstruction. It is an
original, deliberately smaller WGSL implementation, not an N8AO port or a claim of
matching its quality. It uses fixed per-pixel hash rotation, not N8AO's blue-noise
asset, neural denoising or temporal accumulation. It can show grain, thin-feature
loss and screen-space haloing. Offscreen/hidden geometry cannot occlude. There is
no motion-history buffer to ghost when the scene changes.

## SSS passes

1. **Geometry:** the same buffers, with diffuse/specular separated.
2. **Horizontal diffusion:** nine samples across the chosen pixel radius.
3. **Vertical diffusion:** nine samples of the horizontal result. RGB Gaussian
   profiles have different widths: red spreads farther than green and blue.
   Material IDs reject samples from another sphere/floor; depth and normal weights
   protect boundaries. The floor and background bypass scattering.
4. **Composite:** mix original and filtered diffuse by strength (0–1), then add the
   unfiltered specular highlight. Debug mode shows scattered diffuse alone.

Radius is in **scene-buffer pixels**, not world millimeters. It is an artistic
screen-space approximation, inspired by [Toy Bricks](https://github.com/robert-leitl/toy-bricks)
and its diffuse-only separable blur. It does not model thickness, back-face
transmission, volumetric transport, or wavelength-calibrated materials. The slit
pattern is a diagnostic lighting pattern: compare its hard diffuse stripes with
the filtered result, and verify that highlights stay sharp.

The separable, geometry-weighted filter is approximate. Large radii can undersample
with only nine taps; it is intentional that the sample count remains bounded.

## Binding and uniform contract

All pipelines use group 0. Uniform buffer: two `vec4f` values / 32 bytes.

| Slot | Contents |
| --- | --- |
| `sizeRadius` | scene width, scene height, radius, strength |
| `settings` | orbit radians, light Z component, view index, SSAO sample count or SSS pattern flag (0 slits, 1 uniform) |

| Pipeline | Bindings after uniform binding 0 |
| --- | --- |
| Geometry | 1 diffuse storage output; 2 geometry storage output |
| SSAO | 1 geometry sampled; 2 AO storage output |
| AO blur | 1 geometry sampled; 2 raw AO sampled; 3 filtered AO storage output |
| SSS horizontal/vertical | 1 original diffuse sampled; 2 geometry sampled; 3 current diffuse sampled; 4 next diffuse storage output |
| Display | 1 original diffuse sampled; 2 geometry sampled; 3 final effect sampled |

Every read and write uses a different texture within a dispatch. Separate passes
establish ordering; the two SSS directions have separate pipelines and bind groups.
The shader modules, buffers and groups are created outside the frame loop.

## Performance and verification

- Scene buffers cap their longest side at 960 pixels. Canvas DPR caps at 1.5.
- SSAO effect buffers default to half width **and** half height (one quarter pixels).
  SSS runs at scene-buffer resolution; both reuse four intermediate textures.
- The on-screen MiB count covers these four textures only, excluding engine color,
  depth, browser presentation and driver overhead. At 960×652 it is about 11.9 MiB
  for half-resolution AO and 19.1 MiB for SSS.
- Three compute passes run only after invalidation. Ordinary pointer movement can
  wake the engine's short settle window, but reuses the effect textures. There is
  no continuous animation, sample accumulation, CPU pixel readback or per-frame
  texture/bind-group allocation. Stable update counts verify computation is idle.
- Status explicitly says **GPU time not measured**. Pass count, JS callback timing
  and the update counter are not substitutes for GPU timestamp measurements. A
  production performance claim still needs target-device GPU timing including
  geometry, denoising and compositing. Small bundles alone do not establish this.
- `bun run bin/build.ts` includes Bun/Vite consumer checks for each recipe and
  checks that unrelated glass/SSS/SSAO shader code is absent. Existing tiny shader
  and capability bundles must remain tiny. Run `bun test package` too.

Browser checks: verify combined/effect/split views, radius and light controls,
SSAO half/full quality resize, both backend selections, repeated mounts and idle
update counts. The initial implementation was visually checked on WebGPU;
WebGL2's readable fallback was checked separately. Fine geometry, arbitrary
materials, animated physics, GPU timing, and broader device coverage remain beyond
this synthetic reference scene.

Measured consumer fixtures (Bun 1.4.0 / Vite, gzip-9, including the example UI):
SSS initial 7,264 / 7,107 bytes; SSAO initial 7,616 / 7,482 bytes. All emitted
backend chunks total 11,879 / 11,609 bytes for SSS and 12,232 / 11,984 bytes for
SSAO. These are generated bundle measurements, not network request traces.
The separate recipe checks pass alongside the existing small-consumer budgets.

Validation: 114 package tests passed (one optional font-generation test skipped),
36 consumer bundle checks passed, and the Vite harness built. Browser checks
covered SSS uniform/slit lighting, split comparison, AO-only output, normals,
half/full resolution changes, backend remounts, stable compute-update counters and
absence of shader validation errors. Existing harness TypeScript errors remain in
`fxaa.ts` and nullable host references in `harness/src/main.ts`; no new diagnostics
were reported in these shader labs.

## WIP verification

`bun run bin/build.ts` runs direct/index consumer bundle checks under Bun and
Vite, plus the material conversion/isolation tests (`bun run test:examples`).
Build the runtime audit with `bun run --cwd harness build:perf`, preview it, then
open `/perf.html?backend=webgpu&scenario=wip` and repeat with `backend=webgl2`.
The WIP group includes fabric, SSS and SSAO. SSS/SSAO on WebGL2 test their explicit
fallback, not a simulated version of the effects. Idle checks are not a substitute
for visual correctness, control interaction or GPU timing checks.
