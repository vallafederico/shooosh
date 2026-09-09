/** Optional CPU transform math. No renderer, DOM or physics imports.
 * Quaternions are unit rotations in {x,y,z,w} order. Euler angles are radians,
 * matching createObject's Rz × Ry × Rx order. Optional outputs avoid allocations.
 */
export type Vector3 = { x: number; y: number; z: number }
export type Quaternion = Vector3 & { w: number }
export type EulerRotation = { rotationX: number; rotationY: number; rotationZ: number }
export type PoseTransform = EulerRotation & { positionX: number; positionY: number; positionZ: number }

/** Compose a * b: b is applied first. Output may alias either input. */
export function multiplyQuaternions(a: Quaternion, b: Quaternion, out: Quaternion = { x: 0, y: 0, z: 0, w: 1 }): Quaternion {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  out.x = x; out.y = y; out.z = z; out.w = w
  return out
}

/** Rotate a vector by a unit quaternion. Output may alias the vector. */
export function rotateVector3(v: Vector3, q: Quaternion, out: Vector3 = { x: 0, y: 0, z: 0 }): Vector3 {
  const tx = 2 * (q.y * v.z - q.z * v.y)
  const ty = 2 * (q.z * v.x - q.x * v.z)
  const tz = 2 * (q.x * v.y - q.y * v.x)
  const x = v.x + q.w * tx + q.y * tz - q.z * ty
  const y = v.y + q.w * ty + q.z * tx - q.x * tz
  const z = v.z + q.w * tz + q.x * ty - q.y * tx
  out.x = x; out.y = y; out.z = z
  return out
}

/** Convert a unit quaternion to Rz Ry Rx Euler angles; at gimbal lock choose X=0. */
export function quaternionToEuler(q: Quaternion, out: EulerRotation = { rotationX: 0, rotationY: 0, rotationZ: 0 }): EulerRotation {
  const { x, y, z, w } = q
  const sinY = Math.max(-1, Math.min(1, 2 * (w * y - z * x)))
  out.rotationY = Math.asin(sinY)
  if (Math.abs(sinY) > 1 - 1e-10) {
    out.rotationX = 0
    out.rotationZ = Math.atan2(2 * (w * z - x * y), 1 - 2 * (x * x + z * z))
  } else {
    out.rotationX = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    out.rotationZ = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
  }
  return out
}

/** Map any unit-quaternion pose (including Rapier) to createObject.setTransform. */
export function poseToTransform(position: Vector3, rotation: Quaternion, out: PoseTransform = {
  positionX: 0, positionY: 0, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0,
}): PoseTransform {
  out.positionX = position.x; out.positionY = position.y; out.positionZ = position.z
  quaternionToEuler(rotation, out)
  return out
}
