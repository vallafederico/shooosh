# Agent copy guide


**Unreleased shader setup:** copy the recipe's `.wgsl` imports and enable
`shoooshShaders` from `shooosh/build`. Live examples use prepared shader data and
`createCanvasScene` where appropriate. See [bundle setups](../docs/bundle-setup.md).

Use [README](./README.md) to choose a look, then use this guide to assemble it.
The exported `run` function is the complete recipe. A `fragment` alone can be a
converter-test stub (particles, fluids, MSDF) and does not reproduce every demo.
Public APIs live in `shooosh`, `shooosh/dom` and `shooosh/utility`; no
`shooosh/examples` export or built-in named visual presets exist.

## Find and run

From a source checkout with workspace dependencies installed:

```sh
pnpm install
pnpm --filter harness dev
```

Open `http://localhost:5173/?demo=<id>&backend=webgpu`, then repeat with
`backend=webgl2`. Every ID below matches its filename. An unknown ID silently
selects the first catalog entry, so verify the visible title. The default backend
is `auto`; forcing WebGPU may fail on an unsupported device.

If you only installed npm, obtain these files from the repository at the tag
matching your installed version. Unreleased examples may require the unreleased
package: use this workspace to test them. Do not import the catalog/index into a
production page just to get one look; import the selected module directly.

Copy `shaders.d.ts` with `types.ts` for TypeScript. Copy every imported `.wgsl` file alongside each demo/helper. Most match the recipe filename; physics uses `physics-lab.wgsl`, PBR uses `pbr.wgsl`, and fabric uses `fabric-{diffuse,sheen,coat}.wgsl`. These shader files are part of the complete copy sets below. To change composed fabric source, also copy `materials/fabric-variants.ts` and regenerate the variants with `bin/example-shaders.ts`.

## Complete copy sets

Copy the demo and every helper listed in its row into the same directory. Helpers
include transitive local imports and TypeScript types. The `types.ts` imports erase
at build time. Existing examples generate their texture/icon assets locally; SVG
files under `assets/icons` are source references rather than required fetches.

All rows use both render backends except the two fluid simulations, GPGPU particles and the SSS/SSAO compute labs. "Both" describes
the intended backend path, not a claim of exhaustive visual parity or accessibility.

| ID / source | `run` target | Additional local files | Backend / adaptation note |
| --- | --- | --- | --- |
| `gpgpu-particles` | sized `HTMLElement` | `gpgpu-particles-shaders.ts`, `types.ts` | WebGPU compute only; visible unsupported message on WebGL2. See [guide](./gpgpu-particles.md). |
| [rig-bones](./rig-bones.ts) | Empty host, minimum 640px height | [rig-fixture.ts](./rig-fixture.ts), [physics-lab.wgsl](./physics-lab.wgsl), [types.ts](./types.ts), [shaders.d.ts](./shaders.d.ts) | Both; built-in arm or local rig JSON, bones/socket visualization only. See [setup](./rig-bones.md). |
| [car-pbr](./car-pbr.ts) | Empty host with explicit height | [types.ts](./types.ts), prepared [standalone studio](../packages/model/demo/car-pbr/README.md) at `./car-pbr/` | Both; local model assets required; decoded KTX2 preview, static pose. See [setup](./car-pbr.md). |
| [sss](./sss.ts) **WIP** | Canvas in a positioned, sized parent | [sss-shaders.ts](./sss-shaders.ts), [screen-space-scene.ts](./screen-space-scene.ts), [screen-space-lab.ts](./screen-space-lab.ts), [types.ts](./types.ts) | WebGPU only; see [pass guide](./screen-space-effects.md). |
| [ssao](./ssao.ts) **WIP** | Canvas in a positioned, sized parent | [ssao-shaders.ts](./ssao-shaders.ts), [screen-space-scene.ts](./screen-space-scene.ts), [screen-space-lab.ts](./screen-space-lab.ts), [types.ts](./types.ts) | WebGPU only; explicit WebGL2 fallback. |
| [dom-integration](./dom-integration.ts) | Empty host with explicit height | [dom-canvas-input.ts](./dom-canvas-input.ts), [dom-integration-art.ts](./dom-integration-art.ts), [dom-integration-style.ts](./dom-integration-style.ts), [types.ts](./types.ts) | Both; source-only lab including experimental input (see below). |
| [domain-warp](./domain-warp.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [fluid-ambient](./fluid-ambient.ts) | Canvas | [fluid-shaders.ts](./fluid-shaders.ts), [fluid-sim.ts](./fluid-sim.ts), [types.ts](./types.ts) | WebGPU simulation; WebGL2 clear color only. Automatic splats. |
| [fluid-pointer](./fluid-pointer.ts) | Canvas | [fluid-shaders.ts](./fluid-shaders.ts), [fluid-sim.ts](./fluid-sim.ts), [types.ts](./types.ts) | WebGPU simulation; WebGL2 clear color only. Pointer adds splats. |
| [fxaa](./fxaa.ts) | Canvas | [handle.ts](./handle.ts), [post-shaders.ts](./post-shaders.ts), [types.ts](./types.ts) | Both; copy both `applyEffect` languages; strength 0 gives the comparison. |
| [fabric-sheen](./fabric-sheen.ts) **WIP** | Canvas in positioned parent | [fabric](./materials/fabric.ts), [sheen](./materials/sheen.ts), [clearcoat](./materials/clearcoat.ts), [types.ts](./types.ts) | Both; static comparison with native controls; [material notes](./fabric-sheen.md) |
| [gradient](./gradient.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [grain-bloom](./grain-bloom.ts) | Canvas | [handle.ts](./handle.ts), [post-shaders.ts](./post-shaders.ts), [types.ts](./types.ts) | Both; keep bloom → FXAA → grain ordering and both effect languages. |
| [grid](./grid.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [item-fill](./item-fill.ts) | Host containing `[data-card]` children | [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [mouse-light](./mouse-light.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [mouse-magnify](./mouse-magnify.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [msdf-text](./msdf-text.ts) | Host with `[data-msdf]` (or the host itself) | [make-sdf.ts](./make-sdf.ts), [types.ts](./types.ts) | Both; browser demo atlas. Bake production fonts with `shooosh/msdf`. |
| [object-env](./object-env.ts) | Canvas | [make-texture.ts](./make-texture.ts), [types.ts](./types.ts) | Both; keep environment texture `flipY: false`. |
| [object-mesh](./object-mesh.ts) | Canvas | [types.ts](./types.ts) | Both; procedural mesh, no GLB fetch. Replace geometry to load a model. |
| [object-pbr](./object-pbr.ts) | Canvas | [make-texture.ts](./make-texture.ts), [pbr-shaders.ts](./pbr-shaders.ts), [types.ts](./types.ts) | Both; material slots and shared environment are set in `run`. |
| [physics-3d](./physics-3d.ts) | Canvas in positioned parent | [physics-3d-world.ts](./physics-3d-world.ts), [physics-clock.ts](./physics-clock.ts), [types.ts](./types.ts) | Both; install `@dimforge/rapier3d-compat`; requires unreleased world-position API; see [physics guide](./physics.md). |
| [physics-pile](./physics-pile.ts) | Canvas in positioned parent | [physics-lab.ts](./physics-lab.ts), [physics-world.ts](./physics-world.ts), [physics-clock.ts](./physics-clock.ts), [types.ts](./types.ts) | Both; install `@dimforge/rapier2d-compat`; see [physics guide](./physics.md). |
| [physics-pendulum](./physics-pendulum.ts) | Canvas in positioned parent | [physics-lab.ts](./physics-lab.ts), [physics-world.ts](./physics-world.ts), [physics-clock.ts](./physics-clock.ts), [types.ts](./types.ts) | Both; same optional Rapier dependency; 2D joints. |
| [object-spin](./object-spin.ts) | Canvas | [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [particles-field](./particles-field.ts) | Canvas | [types.ts](./types.ts) | Both; copy `run`, not the stub fragment. Points vs instanced quads. |
| [plasma](./plasma.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [raymarch-clouds](./raymarch-clouds.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; copy `raymarch-clouds.wgsl`; bounded volume integration, DPR 1; [guide](./raymarching.md). |
| [raymarch-lights](./raymarch-lights.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; copy `raymarch-lights.wgsl`; sphere tracing, soft shadows and AO; [guide](./raymarching.md). |
| [refractive-glass](./refractive-glass.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; also imports `shooosh/utility`. Procedural backdrop, no HTML capture. |
| [scroll-cards](./scroll-cards.ts) | Scrollable page with `[data-card]` children | [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [scroll-sections](./scroll-sections.ts) | Scrollable page with `[data-plane]` sections | [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [sdf-icons](./sdf-icons.ts) | Host containing `[data-icon]` children | [make-sdf.ts](./make-sdf.ts), [types.ts](./types.ts) | Both; browser-generated SDFs. Bake production assets ahead of time. |
| [sdf-rings](./sdf-rings.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [textured-item](./textured-item.ts) | Host containing `[data-card]` children | [make-texture.ts](./make-texture.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [textured-plane](./textured-plane.ts) | Canvas | [handle.ts](./handle.ts), [make-texture.ts](./make-texture.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |
| [value-noise](./value-noise.ts) | Canvas | [handle.ts](./handle.ts), [types.ts](./types.ts) | Both; retain the shader and frame updates together. |

## Mount and own the lifecycle

Canvas demos need a real canvas with a nonzero CSS size. For example:

```html
<div style="height: 420px">
  <canvas id="look" style="display:block;width:100%;height:100%" aria-hidden="true"></canvas>
</div>
```

Inside a client mount callback (not SSR rendering):

```ts
import { run } from "./plasma"

const canvas = document.querySelector<HTMLCanvasElement>("#look")!
const handle = run(canvas, { backend: "auto" })
void handle.ready?.then(backend => {
  if (!backend) console.info("Keeping the native page visible")
}).catch(error => {
  console.error("Shader example initialization failed", error)
})
// Return/register this with the framework's unmount lifecycle:
const cleanup = () => handle.destroy()
```

The caller owns the host and semantic content. Keep headings, links and controls
in HTML; a decorative canvas is not their accessible replacement. `destroy()`
releases example-owned GPU resources/listeners; remove your own markup separately.
Do not assume `ready` means every asynchronous shader has drawn a frame. Inspect
the canvas too. When adapting asynchronous loading, preserve cancellation guards
and exercise unmount-before-ready; not every old recipe has hardened this race.

For item demos, provide the selectors from the table with explicit dimensions:

```html
<div id="cards">
  <article data-card style="width:320px;height:220px">Native content</article>
  <article data-card style="width:320px;height:220px">Native content</article>
</div>
```

Call `run(document.querySelector<HTMLElement>("#cards")!)` from `item-fill.ts` or
`textured-item.ts`. Use the corresponding selector for icons/sections. A scroll
recipe needs enough page height to actually scroll. The shared canvas is behind
the page: opaque card backgrounds can cover it. See [mount.ts](./mount.ts) and
[harness styles](../harness/src/styles.css) for gallery markup/presentation; these
are host scaffolding, not additional package APIs. Most root primitives use the
current default engine; avoid mounting unrelated default-engine scenes together.
The DOM adapter's explicit engine ownership is a different integration path.

When extracting only a material, retain the original initialization order:
initialize engine → load textures/create compute → attach primitives/post → frame
updates. Dispose subscriptions and primitives before their textures/engine; pair
every acquired shared layer with `releaseLayer()`. For fluids, dispose the fluid
simulation, then its compute session, then the scene. The simulation does not own
the compute session.

## Uniforms and interaction

Read `run` and `onFrame` alongside the shader before changing a slot:

- Most animated screens use `value1` for seconds; pointer looks usually use
  `value2`/`value3` for top-origin 0..1 UV. `createMouseMonad` starts at −1..1.
- Glass uses `value5`/`value6` for pitch/yaw radians, `value9` for framebuffer aspect,
  and `value10` for **1 / framebuffer height**. Pointer UV is `value2`/`value3`.
  Drag rotates, release adds inertia, and double-click resets. Reduced motion
  disables inertia and pointer reflections. For a product control, add keyboard
  rotation/reset and accessible instructions; the demo's canvas is not a finished
  accessible control. Its `touch-action: none` prevents scrolling on that surface.
- DOM lab `value1` is shader mix, not time. The input's text, caret and selection
  are drawn into a texture while a real HTML input owns browser editing.
- Post effects have their own parameter maps in [post-shaders.ts](./post-shaders.ts).
  PBR material slots are described in [pbr-shaders.ts](./pbr-shaders.ts).
- MSDF and icon shaders use dimensions and distance-field spread slots. Keep those
  updates when resizing; a generic time/pointer callback would overwrite them.

## DOM lab boundary

`dom-integration.ts` includes `dom-canvas-input.ts`, which imports `ItemManager`,
GPU internals and geometry from `../package/`. Copying these files alone into an
npm application will not work. Run the full lab in this checkout. For portable
image enhancement, follow the public [DOM guide](../docs/dom.md) and use
`createDomLayer`/`media`; do not turn the prototype's internal imports into an API.

The input mirror caches geometry and performs a check-only layout/font repair once
per second while visible. It filters net-zero attribute mutations from image repair
scans. Its internal `invalidate()` hook can be called after application layout
changes; call it during application-driven layout animations, which are outside
this prototype’s automatic tracking contract. Caret timers pause offscreen.

The input mirror is an authored single-line LTR prototype, not arbitrary HTML
capture or HTML-in-canvas support. IME composition and RTL retain native paint.
Native SVG buttons and controls remain DOM. Use the lab's DOM toggle, shader mix,
Run checks, disposal/remount, keyboard editing, selection, and native fallback to
compare behavior. General input mirroring is still tracked in
[task 11](../docs/agent-tasks/11-dom-mirroring-hardening.md).

## Verify an adaptation

1. Open the exact demo on both forced backends. Compare visible output and logs;
   fluids should show their documented WebGL2 clear-color fallback.
2. Resize the host, scroll item examples, move/drag the pointer, and operate native
   controls by keyboard. Test reduced motion for motion-sensitive interactions.
3. Destroy and remount, including removal during asynchronous initialization.
   Check for duplicate canvases, listeners, stale textures and continued rendering.
4. Verify a readable native page when GPU initialization fails. Shader compile
   failures should surface errors and preserve the last good program where supported.
5. If changing shaders/package code, run `bun test package` and
   `bun run bin/build.ts`. Converter/build checks do not replace browser inspection.
   Run `pnpm --filter harness build` for harness changes.

Known limits are recorded in the [DOM specification](../docs/proposals/dom-mirroring-delivery-plan.md)
and [performance audit](../docs/audits/2026-09-08-tree-shaking-results.md), including
the WebGPU screen path with an unused uniform binding. Do not claim all browser
edge cases are solved because the catalog renders or a build passes.

## Rig example

`rig-bones` → `rig-bones.ts`, `rig-fixture.ts`, `physics-lab.wgsl`, `types.ts` and
`shaders.d.ts`. Mount in an element, both backends. `shooosh/rig` and `/utils`
are explicit imports. Built-in arm requires no external asset; prepare the car
JSON locally as described in [rig-bones.md](./rig-bones.md). Playback/scrubbing
show bones and a socket marker, not deformed model geometry. Await `ready`,
retain the readable controls on GPU failure and call `destroy` on unmount.
