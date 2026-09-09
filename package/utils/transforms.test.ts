import { test, expect } from "bun:test"
import { multiplyQuaternions, rotateVector3, quaternionToEuler, poseToTransform } from "./index"
const axis = (key: "x" | "y" | "z", angle: number) => ({ x: 0, y: 0, z: 0, w: Math.cos(angle / 2), [key]: Math.sin(angle / 2) })
const fromEuler = (x: number, y: number, z: number) => multiplyQuaternions(axis("z", z), multiplyQuaternions(axis("y", y), axis("x", x)))
test("Euler conversion preserves rotations including both gimbal-lock poles", () => {
  for (const y of [-Math.PI / 2, -1.2, 0, 0.9, Math.PI / 2]) {
    const q = fromEuler(0.6, y, -0.8)
    const e = quaternionToEuler(q)
    const roundtrip = fromEuler(e.rotationX, e.rotationY, e.rotationZ)
    const dot = q.x * roundtrip.x + q.y * roundtrip.y + q.z * roundtrip.z + q.w * roundtrip.w
    expect(Math.abs(dot)).toBeCloseTo(1, 8)
  }
})
test("composition applies right operand first and supports aliasing", () => {
  const a = axis("x", 0.6), b = axis("y", 0.9), v = { x: 2, y: -1, z: 3 }
  const sequential = rotateVector3(rotateVector3(v, b), a)
  const composed = multiplyQuaternions(a, b)
  expect(multiplyQuaternions(a, b, a)).toEqual(composed)
  const result = rotateVector3(v, composed, v)
  for (const key of ["x", "y", "z"] as const) expect(result[key]).toBeCloseTo(sequential[key], 10)
})
test("pose mapping reuses output and copies positions without a renderer", () => {
  const out = { positionX: 0, positionY: 0, positionZ: 0, rotationX: 1, rotationY: 1, rotationZ: 1 }
  expect(poseToTransform({ x: 3, y: 4, z: 5 }, axis("x", 0), out)).toBe(out)
  expect(out).toEqual({ positionX: 3, positionY: 4, positionZ: 5, rotationX: 0, rotationY: 0, rotationZ: 0 })
})
