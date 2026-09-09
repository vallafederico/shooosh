/** Example-owned Rapier world. No renderer imports; units are metres, y points up. */
import type RAPIER from "@dimforge/rapier2d-compat"
export type PhysicsMode = "pile" | "pendulum"
let loading: Promise<typeof RAPIER> | undefined
export function loadRapier() {
  return loading ??= import("@dimforge/rapier2d-compat").then(async ({ default: rapier }) => {
    await rapier.init()
    return rapier
  }).catch(error => { loading = undefined; throw error })
}

export function createPhysicsWorld(rapier: typeof RAPIER, mode: PhysicsMode) {
  const world = new rapier.World({ x: 0, y: -9.81 })
  world.timestep = 1 / 60
  const shapes: { body: RAPIER.RigidBody; width: number; height: number; fixed: boolean }[] = []
  function box(x: number, y: number, width: number, height: number, fixed = false) {
    const body = world.createRigidBody((fixed ? rapier.RigidBodyDesc.fixed() : rapier.RigidBodyDesc.dynamic())
      .setTranslation(x, y).setLinearDamping(0.15).setAngularDamping(0.3).setCcdEnabled(!fixed))
    world.createCollider(rapier.ColliderDesc.cuboid(width / 2, height / 2)
      .setFriction(0.65).setRestitution(0.25), body)
    shapes.push({ body, width, height, fixed })
    return body
  }
  box(0, -4.3, 10, 0.35, true)
  box(-5, 0, 0.3, 9, true)
  box(5, 0, 0.3, 9, true)
  if (mode === "pile") {
    for (let i = 0; i < 15; i++) {
      const body = box((i % 5 - 2) * 1.1, -2.8 + Math.floor(i / 5) * 1.7, 0.82, 0.82)
      body.setRotation((i % 3 - 1) * 0.16, true)
    }
  } else {
    const anchor = box(0, 3.5, 0.45, 0.45, true)
    let previous = anchor
    for (let i = 0; i < 4; i++) {
      const body = box(0, 2.7 - i * 1.6, 0.38, 1.6)
      world.createImpulseJoint(rapier.JointData.revolute(
        { x: 0, y: i === 0 ? 0 : -0.8 }, { x: 0, y: 0.8 }), previous, body, true)
        .setContactsEnabled(false)
      previous = body
    }
    previous.applyImpulse({ x: 2.5, y: 0 }, true)
  }
  const dynamic = shapes.filter(shape => !shape.fixed)
  return { world, shapes, dynamic,
    kick() { dynamic.forEach(({ body }, i) => body.applyImpulse({ x: (i % 2 ? -1 : 1) * 1.5, y: 3 }, true)) },
    sleeping() { return dynamic.every(({ body }) => body.isSleeping()) },
    destroy() { world.free() },
  }
}

export { createPhysicsClock } from "./physics-clock"
