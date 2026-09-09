/** Column-major affine matrix math; no renderer dependencies. */
export type Mat4 = number[]
export const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}
export function compose(
  t: readonly number[],
  q: readonly number[],
  s: readonly number[],
): Mat4 {
  const [x, y, z, w] = q
  return [
    (1 - 2 * (y * y + z * z)) * s[0],
    2 * (x * y + z * w) * s[0],
    2 * (x * z - y * w) * s[0],
    0,
    2 * (x * y - z * w) * s[1],
    (1 - 2 * (x * x + z * z)) * s[1],
    2 * (y * z + x * w) * s[1],
    0,
    2 * (x * z + y * w) * s[2],
    2 * (y * z - x * w) * s[2],
    (1 - 2 * (x * x + y * y)) * s[2],
    0,
    ...t,
    1,
  ]
}
/** Rz * Ry * Rx Euler convention, radians. */
export function eulerQuaternion(r: readonly number[]) {
  const [x, y, z] = r.map((v) => v / 2)
  const cx = Math.cos(x),
    cy = Math.cos(y),
    cz = Math.cos(z),
    sx = Math.sin(x),
    sy = Math.sin(y),
    sz = Math.sin(z)
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]
}
export function point(m: ArrayLike<number>, x: number, y: number, z: number) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}
/** Bake positions and inverse-transpose normals, retaining the input geometry. */
export function bake(vertices: Float32Array, m: ArrayLike<number>) {
  const a = m[0],
    b = m[4],
    c = m[8],
    d = m[1],
    e = m[5],
    f = m[9],
    g = m[2],
    h = m[6],
    i = m[10]
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) throw new Error("Singular scale cannot be rendered")
  const normal = [
    (e * i - f * h) / det,
    (f * g - d * i) / det,
    (d * h - e * g) / det,
    (c * h - b * i) / det,
    (a * i - c * g) / det,
    (b * g - a * h) / det,
    (b * f - c * e) / det,
    (c * d - a * f) / det,
    (a * e - b * d) / det,
  ]
  const out = new Float32Array(vertices.length)
  for (let k = 0; k < vertices.length; k += 6) {
    out.set(point(m, vertices[k], vertices[k + 1], vertices[k + 2]), k)
    const x = vertices[k + 3],
      y = vertices[k + 4],
      z = vertices[k + 5]
    const nx = normal[0] * x + normal[1] * y + normal[2] * z,
      ny = normal[3] * x + normal[4] * y + normal[5] * z,
      nz = normal[6] * x + normal[7] * y + normal[8] * z
    const length = Math.hypot(nx, ny, nz) || 1
    out.set([nx / length, ny / length, nz / length], k + 3)
  }
  return { vertices: out, mirrored: det < 0 }
}
