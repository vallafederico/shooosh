# Bone references and rig utilities

Import explicitly from `shooosh/rig`. This entry has no runtime dependencies,
renderer imports, DOM access, timers or automatic updates. It is built separately
and is never re-exported by `shooosh`, `/dom`, `/utils` or either backend entry.
Unused imports disappear; importing bone utilities alone does not retain the
animation sampler or palette helpers.

Prepare imported data on Node with the separate model package:

```sh
shooosh-model convert character.fbx --out character.glb
shooosh-model rig character.glb --out character.rig.json
```

The Node API exports `prepareRig(input)` (returns a `RigDefinition`) and
`generateRig(input, output)` (writes a new JSON file, refuses overwrite).
Conversion remains responsible for format decoding. Rig extraction includes all
nodes, mesh/skin references, joint order, inverse bind matrices and decoded TRS
animation tracks. Morph-weight and extension animation channels are reported in
`warnings` and omitted. Inspect those warnings before using a clip.

```ts
import { createRig, createRigAnimator, getSocketMatrix } from "shooosh/rig"
import type { RigDefinition } from "shooosh/rig"

const response = await fetch("/character.rig.json")
if (!response.ok) throw new Error(`Rig: HTTP ${response.status}`)
const data: RigDefinition = await response.json()
const rig = createRig(data)
const animator = createRigAnimator(rig, data.clips ?? [])

// Use an actual imported key/index, or a unique authored bone name.
const hand = rig.bone("Hand")
animator.sample(0, 1.25, { loop: true })
hand.setLocal({ rotation: [0, 0, 0, 1] })
const socket = getSocketMatrix(rig, hand.id)
// Apply socket to your attachment using your renderer's transform interface.
```

The rig state is independent of the rigid model workbench. Updating it does not
currently deform that workbench's geometry. A renderer consuming skin matrices
and vertex joint/weight attributes is needed for visible skeletal animation.

## References and local poses

- `rig.nodes`: stable, read-only references to every node, including non-joint
  ancestors. Each exposes `id`, `key`, `name`, `parent`, `children`, `mesh`, `skin`,
  `isJoint` and `isStaticMatrix`.
- `rig.bones`: joint references. For a manually authored hierarchy without skins,
  every node is considered a bone.
- `rig.node(indexOrKeyOrUniqueName)` and `rig.bone(...)`: strict lookups. Unknown
  references and ambiguous names throw. Keys take precedence over names.
  `rig.findBones(name)` returns all matching joints for explicit selection.
- `bone.setLocal({ translation, rotation, scale })`: absolute local TRS patches,
  not additive offsets. Omitted fields retain their current values. Quaternions
  use `[x,y,z,w]` and are normalized; zero/non-finite values are rejected.
- `bone.getLocal()` returns a copy. `bone.worldMatrix(out?)` returns a column-major
  `Float64Array(16)` in rig/model space. A provided output is reused.
- `rig.setPose([{ node, transform }], { reset? })` validates every patch before
  changing state. `rig.getPose()` returns a snapshot; `rig.reset()` restores the
  imported pose. Static matrix nodes preserve their full matrix and reject TRS
  editing and animation targets.

World transforms are recomputed in parent order after a pose change, on the next
matrix read or explicit `rig.update()`. Repeated unchanged reads use the cache.
This is CPU pose math, not an allocation-free animation mixer; it performs no
work until called. It supports deep hierarchies without recursive traversal.

## Sampling clips

`createRigAnimator(rig, clips)` validates and copies the tracks once. Its `clips`
list contains stable keys, names, durations and channel counts.
`sample(clipIndexOrKeyOrUniqueName, seconds, options?)` supports STEP, LINEAR and
CUBICSPLINE tracks. Quaternion LINEAR uses shortest-arc spherical interpolation;
cubic quaternion output is normalized after interpolation.

Time is clamped by default. `{ loop: true }` wraps positive/negative time to
`[0, duration)`. The default `{ reset: true }` restores imported values for
properties not animated by the selected clip, avoiding leftovers from a previous
clip. Use `{ reset: false }` to retain current untargeted values. No internal clock
runs; call `sample` from an existing application loop. Clip blending, IK,
retargeting, constraints, automatic weight painting and mesh deformation are not
implemented.

## Skin palettes and sockets

```ts
import { writeSkinMatrices, getSocketMatrix } from "shooosh/rig"

const mesh = rig.nodes.find(node => node.skin !== null)!
const palette = new Float32Array(rig.skins[mesh.skin!].joints.length * 16)
writeSkinMatrices(rig, mesh.skin!, mesh.id, palette)
const attachmentMatrix = getSocketMatrix(rig, "Hand")
```

`writeSkinMatrices(rig, skinIndexOrKey, meshNode?, out?)` preserves the skin's joint
order. With a mesh node, matrices are `inverse(meshWorld) * jointWorld * inverseBind`:
use this when the renderer later applies the mesh world transform, canceling it.
With `null` (default), the palette is `jointWorld * inverseBind` in rig/model space;
do not apply the authored skinned mesh node transform again. Apply application
model placement separately. Singular mesh transforms fail without modifying the
output. Missing inverse binds are identities.

`getSocketMatrix(rig, bone, localOffsetMatrix?, out?)` multiplies the bone world
matrix by an optional affine attachment offset. It does not attach scene objects
or register callbacks.

Coordinate/animation conventions follow the
[Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations).
Extracted JSON identifies one exact source artifact; regenerate it after changing
hierarchy or animation data. Runtime validation rejects malformed references,
cycles and non-finite data, but is not a sandbox or an untrusted-file memory cap.

Run [Rig · bones & sockets](../examples/rig-bones.md) in the example gallery for a
working bone/clip/socket integration on both backends.
