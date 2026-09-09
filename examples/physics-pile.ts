/** Falling blocks: Rapier collisions, friction, restitution and sleeping. See physics.md. */
import { fragment, runPhysics } from "./physics-lab"
import type { ExampleRunOptions, ExampleSpec } from "./types"
export { fragment }
export const run = (canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) => runPhysics(canvas, "pile", options)
export const physicsPile: ExampleSpec = {
  id: "physics-pile", label: "Physics · falling blocks", fragment,
  copy: "Rapier 2D collisions + shaded meshes. Pause, reset, or apply an impulse. Both render backends.",
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
