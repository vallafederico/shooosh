# Optional transform utilities (unreleased)

Import from `shooosh/utils`. This subpath has no DOM, GPU, Rapier or framework
imports, no initialization, and no root re-export. ESM consumers can remove unused
helpers individually. Existing `shooosh/utility` interaction helpers stay separate.

```ts
import { poseToTransform } from "shooosh/utils"

const pose = {
  positionX: 0, positionY: 0, positionZ: 0,
  rotationX: 0, rotationY: 0, rotationZ: 0,
}
// Inside your update loop; compatible with Rapier's structural pose types:
object.setTransform(poseToTransform(body.translation(), body.rotation(), pose))
```

All quaternion inputs must be finite **unit quaternions**, `{ x, y, z, w }`.
Helpers deliberately do not validate/normalize on each frame. Position units are
those of the caller; Euler outputs are radians in the mesh renderer's
`Rz × Ry × Rx` order. `createObject` retains its small position API and owns the
model matrix, projection and depth testing. These utilities only prepare inputs.

| Helper | Contract |
| --- | --- |
| `multiplyQuaternions(a, b, out?)` | Compose `a * b`, applying `b` first. Output can alias either input. |
| `rotateVector3(vector, quaternion, out?)` | Rotate a vector; output can alias the input vector. |
| `quaternionToEuler(quaternion, out?)` | Return `{ rotationX, rotationY, rotationZ }`; at gimbal lock choose X=0. |
| `poseToTransform(position, quaternion, out?)` | Return the three position fields plus Euler rotation fields for `setTransform`. |

An omitted `out` allocates a new object. Pass one owned output per simultaneous
operation to reuse storage. Results are not retained by these functions. Euler
representations can jump between equivalent angles; do not interpolate Euler
outputs to interpolate orientations. No scene graph, matrix API or physics engine
is bundled here. The [3D physics recipe](../examples/physics.md) demonstrates
composing a view rotation with a rigid-body pose.

Build checks cover ESM/CJS import without browser globals, unused imports,
individual-helper elimination, and exclusion of quaternion conversion from DOM
and item/layer consumer bundles. Unit tests cover composition order, aliasing,
pose mapping and Euler round-trips including both gimbal-lock poles.

Verified in the current checkout: 121 package tests pass (one optional font test
skipped), package/harness builds pass, and all 58 Bun/Vite consumer checks pass.
The pose helper consumer is below 1 KB gzip; a vector-only consumer excludes Euler
conversion. The 3D recipe was visually checked on forced WebGL2 and WebGPU.
