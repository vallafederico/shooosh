import { expect, test } from "bun:test"
import { turntableEuler } from "./turntable"

type M9 = readonly number[]

function mul(a: M9, b: M9): number[] {
  const m = new Array<number>(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!
    }
  }
  return m
}

function rx(t: number): number[] {
  const c = Math.cos(t), s = Math.sin(t)
  return [1, 0, 0, 0, c, -s, 0, s, c]
}

function ry(t: number): number[] {
  const c = Math.cos(t), s = Math.sin(t)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}

function rz(t: number): number[] {
  const c = Math.cos(t), s = Math.sin(t)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}

test("turntable Euler matches Rx(pitch) Ry(yaw) under createObject's Rz Ry Rx", () => {
  const pitch = 0.28
  for (const yaw of [0, -0.65, 0.4, 1.2, Math.PI / 2, Math.PI, 4.2]) {
    const { rotationX, rotationY, rotationZ } = turntableEuler(pitch, yaw)
    const got = mul(rz(rotationZ), mul(ry(rotationY), rx(rotationX)))
    const want = mul(rx(pitch), ry(yaw))
    for (let i = 0; i < 9; i++) expect(got[i]!).toBeCloseTo(want[i]!, 5)
  }
})

test("spin axis stays the pitched up direction as yaw changes", () => {
  const pitch = 0.28
  const up = [0, Math.cos(pitch), Math.sin(pitch)]
  for (const yaw of [0, 0.7, 2.1, Math.PI]) {
    const { rotationX, rotationY, rotationZ } = turntableEuler(pitch, yaw)
    const r = mul(rz(rotationZ), mul(ry(rotationY), rx(rotationX)))
    expect(r[1]!).toBeCloseTo(up[0]!, 5)
    expect(r[4]!).toBeCloseTo(up[1]!, 5)
    expect(r[7]!).toBeCloseTo(up[2]!, 5)
  }
})
