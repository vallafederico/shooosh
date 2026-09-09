import { test, expect } from "bun:test"
import { createPhysicsClock, createPhysicsWorld, loadRapier } from "./physics-world"
import { convertWgslFragmentToGlsl } from "../package/compiler/index"
import { fragment } from "./physics-lab"

test("physics material converts for WebGL2", () => {
  expect(convertWgslFragmentToGlsl(fragment, { includeNormal: true })).toContain("void main()")
})
test("fixed clock is refresh-rate independent and bounds stall catch-up", () => {
  for (const hz of [30, 60, 120, 144]) {
    const clock = createPhysicsClock(); let steps = 0
    for (let i = 0; i <= hz; i++) clock.advance(i * 1000 / hz, () => steps++)
    expect(steps).toBe(60)
    expect(clock.advance(100000, () => {})).toBeLessThanOrEqual(5)
    clock.reset(); expect(clock.advance(200000, () => {})).toBe(0)
  }
})
test("blocks remain contained, sleep, wake on impulse, and reset cleanly", async () => {
  const r = await loadRapier()
  for (let repeat = 0; repeat < 2; repeat++) {
    const sim = createPhysicsWorld(r, "pile")
    try {
      for (let i = 0; i < 1800; i++) sim.world.step()
      for (const { body } of sim.dynamic) {
        const p = body.translation()
        expect(Math.abs(p.x)).toBeLessThan(5)
        expect(p.y).toBeGreaterThan(-4.3)
      }
      expect(sim.sleeping()).toBe(true)
      sim.kick(); expect(sim.sleeping()).toBe(false)
    } finally { sim.destroy() }
  }
})
test("pendulum joints remain connected under repeated impulses", async () => {
  const sim = createPhysicsWorld(await loadRapier(), "pendulum")
  try {
    for (let i = 0; i < 1200; i++) {
      if (i % 120 === 0) sim.kick()
      sim.world.step()
      let anchor = { x: 0, y: 3.5 }
      for (const { body } of sim.dynamic) {
        const p = body.translation(), a = body.rotation()
        const dx = -Math.sin(a) * 0.8, dy = Math.cos(a) * 0.8
        expect(Math.hypot(p.x + dx - anchor.x, p.y + dy - anchor.y)).toBeLessThan(0.12)
        anchor = { x: p.x - dx, y: p.y - dy }
      }
    }
  } finally { sim.destroy() }
})

test("3D cubes settle in tray and torque wakes all axes", async () => {
  const { loadRapier3D, createPhysics3DWorld } = await import("./physics-3d-world")
  const sim = createPhysics3DWorld(await loadRapier3D())
  try {
    for (let i = 0; i < 1800; i++) sim.world.step()
    expect(sim.sleeping()).toBe(true)
    for (const { body } of sim.dynamic) {
      const p = body.translation()
      expect(Math.abs(p.x)).toBeLessThan(3.5)
      expect(Math.abs(p.z)).toBeLessThan(3)
      expect(p.y).toBeGreaterThan(-2.6)
    }
    sim.kick(); sim.world.step()
    expect(sim.sleeping()).toBe(false)
    const velocity = sim.dynamic[0].body.angvel()
    expect(Math.abs(velocity.x)).toBeGreaterThan(0)
    expect(Math.abs(velocity.y)).toBeGreaterThan(0)
    expect(Math.abs(velocity.z)).toBeGreaterThan(0)
  } finally { sim.destroy() }
})
