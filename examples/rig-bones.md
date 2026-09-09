# Rig · bones & sockets

Open `?demo=rig-bones&backend=webgpu` in the Vite harness, or choose **Rig · bones &
sockets** from the gallery. Repeat with `backend=webgl2` for the fallback.

The built-in arm works immediately. **Play**, **Time**, **Clip** and **Rest pose**
exercise explicit animation sampling and resetting. Select a **Bone** and change
**Socket offset**: the lime marker position follows a local offset from that bone.
**Orbit** rotates the view. Blue markers show joints; tapered links connect each
joint to its parent (including non-joint ancestors).

## Load the car or your own rig

Prepare a portable rig artifact on Node:

```sh
pnpm --filter shooosh-model build
mkdir -p harness/public/rig
node packages/model/dist/cli.js rig /path/to/car/original.glb --out harness/public/rig/car.rig.json
```

Click **Load car rig**. The locally supplied car yields 44 joints and five clips;
the example displays credit to [cuadot](https://sketchfab.com/cuadot). This optional
JSON is ignored by Git and is not included in the library package. The CLI refuses
overwrite; use a new path or explicitly remove an old generated artifact yourself.
For other models, use **Open .rig.json** to load the CLI output locally without
uploading it. This visualization limits input to 256 nodes and 8 MiB of JSON.

## Copy set and lifecycle

Copy `rig-bones.ts`, `rig-fixture.ts`, `physics-lab.wgsl`, `types.ts` and
`shaders.d.ts`. Enable `shoooshShaders` from `shooosh/build`. Mount `run(host)` into
an element with a nonzero height (the example supplies a 640px minimum), await
`handle.ready`, and call `handle.destroy()` on removal.

The example imports `createRig`, `createRigAnimator` and `getSocketMatrix` from
`shooosh/rig`; `createObject` draws the bone gizmos through the existing renderer.
It keeps the imported pose separate from view normalization. Quaternion direction
math orients each tapered link between the evaluated parent and child positions.
It subscribes to the existing engine loop, requests frames only while playing,
and pauses advancement while hidden/offscreen. Playback starts paused; scrubbers
remain useful with reduced motion. Destroy removes its observer/listener, aborts
pending fetches and destroys all owned meshes and its scene.

The lime cube demonstrates socket **position** rather than a full orientation
constraint. This is a skeleton/pose example, not skinned mesh rendering: it does
not deform the car's textured geometry. Palette generation for a future skinning
renderer is documented in [the rig API guide](../docs/rig.md).

## Verification

Checked built-in and imported car rigs on forced WebGPU/WebGL2, play/pause,
clip changes, keyboard scrubbing, bone selection, socket offset and gallery
unmount/remount. The narrow gallery layout was also checked. Example TypeScript,
core/harness builds and all 70 consumer bundle checks pass; unrelated example
barrel imports still discard the rig module. The package suite passes 172 tests
with one optional font test skipped.
