/** Private column-major affine math, isolated from renderer code. */
export function numbers(value: ArrayLike<number>, size: number, label: string): number[] {
  if (!value || value.length !== size) throw new Error(`Invalid ${label} length`)
  const result = Array.from(value)
  if (result.some((v) => !Number.isFinite(v))) throw new Error(`Non-finite ${label}`)
  return result
}
export function quaternion(value: ArrayLike<number>): number[] {
  const q = numbers(value, 4, "quaternion")
  const length = Math.hypot(...q)
  if (!Number.isFinite(length) || length === 0) throw new Error("Zero quaternion")
  return q.map((v) => v / length)
}
export function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}
export function affine(value: ArrayLike<number>): number[] {
  const m = numbers(value, 16, "matrix")
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1)
    throw new Error("Expected affine matrix")
  return m
}
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  if (out.some((v) => !Number.isFinite(v))) throw new Error("Matrix overflow")
  return out
}
export function compose(
  t: readonly number[],
  q: readonly number[],
  s: readonly number[],
): number[] {
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
export function inverse(m: ArrayLike<number>): number[] {
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
  if (!Number.isFinite(det) || det === 0) throw new Error("Singular mesh transform")
  const out = [
    (e * i - f * h) / det,
    (f * g - d * i) / det,
    (d * h - e * g) / det,
    0,
    (c * h - b * i) / det,
    (a * i - c * g) / det,
    (b * g - a * h) / det,
    0,
    (b * f - c * e) / det,
    (c * d - a * f) / det,
    (a * e - b * d) / det,
    0,
    0,
    0,
    0,
    1,
  ]
  for (let r = 0; r < 3; r++)
    out[12 + r] = -(out[r] * m[12] + out[4 + r] * m[13] + out[8 + r] * m[14])
  if (out.some((v) => !Number.isFinite(v))) throw new Error("Mesh inverse overflow")
  return out
}
export function slerp(a: readonly number[], b: readonly number[], t: number): number[] {
  let dot = a.reduce((sum, v, i) => sum + v * b[i], 0)
  const sign = dot < 0 ? -1 : 1
  dot = Math.min(1, Math.abs(dot))
  if (dot > 0.9995) return quaternion(a.map((v, i) => v + (b[i] * sign - v) * t))
  const angle = Math.acos(dot),
    denominator = Math.sin(angle)
  return quaternion(
    a.map(
      (v, i) =>
        (v * Math.sin((1 - t) * angle) + b[i] * sign * Math.sin(t * angle)) / denominator,
    ),
  )
}
