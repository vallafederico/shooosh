# Rapier physics examples

- `/?demo=physics-pile&backend=webgl2`: fifteen falling blocks, ground and walls.
- `/?demo=physics-pendulum&backend=webgl2`: four links attached by revolute joints.
- Repeat with `backend=webgpu`. Rapier runs the same CPU/WASM simulation on both.

Copy the selected demo, `physics-lab.ts`, `physics-world.ts`, `physics-clock.ts` and `types.ts`.
Install `@dimforge/rapier2d-compat` (tested with 0.20.0) in the consuming app.
Import `run` directly from the demo; call it on a sized canvas in a positioned
parent, await `handle.ready`, and call `handle.destroy()` when unmounting.
Controls are appended to that parent and removed by the handle. Keep headings
and instructions in native HTML. Initialization failures leave a native status.

Rapier is a root **development** dependency for these repository recipes, not a
runtime dependency or export of shooosh. Its compatibility package embeds WASM
in JavaScript, so the optional download is substantial. `loadRapier()` dynamically
imports it on the first physics mount and shares initialization across remounts.
The production harness emits a separate ~792 KB gzip Rapier chunk.
The engine and unrelated examples do not load it. A consuming bundler must retain
code splitting to preserve the lazy download. The WASM module stays cached;
each owned `World` is freed on reset/unmount, including cancellation during init.

`physics-world.ts` owns gravity, rigid bodies, colliders, joints and timestep.
Metres use y-up coordinates. Colliders use half-extents; rendered boxes use full
width/height. Rounded visual corners approximate rectangular colliders. These
are **2D physics** scenes with shallow shaded meshes, not 3D simulations.
`physics-lab.ts` keeps stable placement/camera option objects and maps body
translations into NDC on every render, fitting the same world when resized.
`setTransform` supplies z rotation in radians. Material `value1` selects color.

Simulation runs before object draws at a fixed 1/60 second step. An accumulator
handles display refresh rates; at most five steps catch up after a stall, dropping
excess elapsed time. There is no pose interpolation, so high-refresh screens can
show repeated poses. No per-frame DOM measurements are used. Sleeping worlds stop
requesting frames; the engine then finishes its settle window. Paused, hidden and
offscreen worlds stop advancing, reset their clock and resume without catch-up.
Reduced-motion preference starts paused. Native Play/Pause, Reset and Apply impulse
buttons support keyboard operation. Impulses while paused take effect on Play.

The renderer uses one mesh/draw per collider: 18 for the pile, 8 for the pendulum.
This is a small integration recipe, not an instanced large-body benchmark. Avoid
mounting simultaneous scenes that depend on shooosh's default engine.

Checks: `bun test examples/physics.test.ts` exercises timestep equivalence, bounded
catch-up, collision containment, sleep/wake, reset and joint stability, plus WGSL
conversion. `pnpm test:examples` includes these checks in the package build.
Browser checks should cover both demos/backends, controls, resize, navigation away
and remount, and unmount while loading. Inspect pixels in addition to `ready`.

Sources: [Rapier JavaScript setup and compatibility packages](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)
and the installed 0.20.0 TypeScript API declarations.

## Verification in this checkout (2026-09-09)

Both demos rendered in the harness on forced WebGL2 and WebGPU with no captured
console warnings/errors. The pile reached Sleeping and Apply impulse woke it;
Pause/Play, Reset and switching between demos/backends were exercised. Narrow
viewport layout still needs a dedicated mobile harness pass.

Package tests: 116 pass, one optional font test skipped. Example checks: eight
pass. Package and harness production builds pass. All 50 Bun/Vite consumer checks
pass, including physics direct/barrel imports, lazy WASM and exclusion from
unrelated consumers. A selected recipe's initial static closure is ~17 KB gzip
in Vite / ~21 KB in Bun; total emitted code including WASM and lazy renderers is
~836–839 KB gzip. These are build measurements, not a browser frame-time benchmark.
Full harness TypeScript checking still reports the existing `fxaa` post-tag and
nullable `stage`/`nav` errors; no physics files appear in those diagnostics.


## True 3D: tumbling cubes

Open `/?demo=physics-3d&backend=webgpu` (or `webgl2`). Eighteen cubes fall into
a tray with five fixed colliders. Apply impulse adds upward velocity and torque
around all three axes. Shapes use 3D cuboid colliders, rigid-body quaternions,
friction, restitution, CCD and sleeping. The camera looks down at an angle.

Copy `physics-3d.ts`, `physics-3d-world.ts`, `physics-clock.ts` and `types.ts`.
Install `@dimforge/rapier3d-compat` (tested at 0.20.0). This recipe requires the
unreleased `createObject` position API in this checkout; it does not run unchanged
against shooosh 0.0.5. The 2D Rapier package is not needed for this copy set.

`shooosh/utils` supplies `multiplyQuaternions`, `rotateVector3` and
`poseToTransform`. The recipe uses them to apply its fixed view rotation, then
convert orientation into the engine's Rz × Ry × Rx Euler convention. Scratch
outputs are reused per mount. Quaternion math is not imported by the engine.
`setTransform({ positionX, positionY, positionZ, rotationX, rotationY, rotationZ })`
updates the shared world-space model matrix. Translation is applied after scale
and rotation, so perspective and depth tests use real mesh positions. The shallow
2D visual approximation is not used here. The example compensates for the mesh
API's default screen scale to preserve metre-sized shapes; resize adjusts camera
distance. No shadows, orbit controls or grabbing are implemented.

Physics uses the same fixed clock, pause/offscreen/hidden rules, reduced-motion
initial pause and cleanup as the 2D recipes. This is 23 mesh draws, not an
instanced stress test. The separate 3D WASM chunk is ~1.08 MB gzip in the production
harness. The 2D and 3D packages load independently on demand; build checks cover
lazy loading and exclusion from unrelated consumers.

Verified 3D rendering on WebGPU and WebGL2. Automated checks cover 3D containment,
sleep/wake, torque, and model-matrix translation/depth on both clip conventions.
