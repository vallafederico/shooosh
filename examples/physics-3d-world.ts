/** Rapier 3D example world. Metres, y up; each mount owns and frees its World. */
import type RAPIER from "@dimforge/rapier3d-compat"
let loading: Promise<typeof RAPIER> | undefined
export function loadRapier3D() {
  return loading ??= import("@dimforge/rapier3d-compat").then(async ({ default: rapier }) => {
    await rapier.init(); return rapier
  }).catch(error => { loading = undefined; throw error })
}
export function createPhysics3DWorld(rapier: typeof RAPIER) {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = 1 / 60
  const shapes: { body: RAPIER.RigidBody; width: number; height: number; depth: number; fixed: boolean }[] = []
  function box(x: number, y: number, z: number, width: number, height: number, depth: number, fixed = false) {
    const body = world.createRigidBody((fixed ? rapier.RigidBodyDesc.fixed() : rapier.RigidBodyDesc.dynamic())
      .setTranslation(x, y, z).setLinearDamping(0.2).setAngularDamping(0.35).setCcdEnabled(!fixed))
    world.createCollider(rapier.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setFriction(0.7).setRestitution(0.3), body)
    shapes.push({ body, width, height, depth, fixed })
    return body
  }
  box(0, -2.6, 0, 7, 0.3, 6, true)
  box(-3.5, -2, 0, 0.25, 1.3, 6, true)
  box(3.5, -2, 0, 0.25, 1.3, 6, true)
  box(0, -2, -3, 7, 1.3, 0.25, true)
  box(0, -2, 3, 7, 1.3, 0.25, true)
  for (let i = 0; i < 18; i++) {
    const body = box((i % 3 - 1) * 1.45, -0.8 + Math.floor(i / 6) * 1.5,
      (Math.floor(i / 3) % 2 - 0.5) * 2, 0.8, 0.8, 0.8)
    const angle = 0.15 + (i % 4) * 0.1
    body.setRotation({ x: Math.sin(angle) / Math.sqrt(3), y: Math.sin(angle) / Math.sqrt(3),
      z: Math.sin(angle) / Math.sqrt(3), w: Math.cos(angle) }, true)
  }
  const dynamic = shapes.filter(shape => !shape.fixed)
  return { world, shapes, dynamic,
    sleeping: () => dynamic.every(({ body }) => body.isSleeping()),
    kick() { dynamic.forEach(({ body }, i) => {
      const p = body.translation()
      // Pull toward tray centre while lifting, so repeated impulses remain useful.
      body.applyImpulse({ x: -p.x * 0.22, y: 2.4, z: -p.z * 0.22 }, true)
      body.applyTorqueImpulse({ x: 0.18, y: (i % 2 ? -1 : 1) * 0.15, z: 0.12 }, true)
    }) },
    destroy: () => world.free(),
  }
}
