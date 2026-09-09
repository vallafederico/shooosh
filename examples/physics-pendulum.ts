/** Four linked rigid bodies: Rapier revolute joints, damping and impulses. See physics.md. */
import { fragment, runPhysics } from "./physics-lab"
import type { ExampleRunOptions, ExampleSpec } from "./types"
export { fragment }
export const run = (canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) => runPhysics(canvas, "pendulum", options)
export const physicsPendulum: ExampleSpec = {
  id: "physics-pendulum", label: "Physics · jointed pendulum", fragment,
  copy: "Four Rapier revolute joints + shaded links. Apply an impulse to set the chain swinging. Both render backends.",
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
