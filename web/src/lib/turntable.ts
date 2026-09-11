/** createObject applies Rz Ry Rx. A pitched turntable is Rx(pitch) Ry(yaw) so spin follows the incline. */
export function turntableEuler(pitch: number, yaw: number) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  return {
    rotationX: Math.atan2(sp, cp * cy),
    rotationY: Math.atan2(cp * sy, Math.hypot(cy, sp * sy)),
    rotationZ: Math.atan2(sp * sy, cy),
  }
}
