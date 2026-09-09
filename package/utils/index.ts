/** Optional, renderer-independent math. Import explicitly from shooosh/utils.
 * No root re-export; unused helpers are tree-shakeable. See docs/utils.md.
 */
export { multiplyQuaternions, rotateVector3, quaternionToEuler, poseToTransform } from "./transforms"
export type { Vector3, Quaternion, EulerRotation, PoseTransform } from "./transforms"
