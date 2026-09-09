/** Optional rig utilities. Import from shooosh/rig; never re-export through core.
 * Pure CPU bone references/poses, explicit-time animation and skin palettes.
 * No loader, renderer, automatic clock, Three.js or runtime dependency.
 * Node model extraction lives in shooosh-model/node. See docs/rig.md.
 */
export { createRig } from "./rig"
export type { Rig } from "./rig"
export { createRigAnimator } from "./animation"
export { writeSkinMatrices, getSocketMatrix } from "./skinning"
export type {
  RigDefinition,
  RigNode,
  RigSkin,
  RigTransform,
  RigPose,
  RigTrack,
  RigClip,
} from "./types"
