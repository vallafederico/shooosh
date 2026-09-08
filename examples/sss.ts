/** WIP — experimental demo, not a finished production recipe.
 * Subsurface scattering. Copy this file, sss-shaders.ts, screen-space-scene.ts,
 * screen-space-lab.ts and types.ts. See screen-space-effects.md for the pass graph,
 * parameters, limits and profiling. No package internals or extra dependencies.
 */
import { runScreenSpaceLab } from "./screen-space-lab"
import { sssShaders } from "./sss-shaders"
import type { ExampleRunOptions, ExampleSpec } from "./types"
/** Converter fixture only; live rendering uses the full WGSL compute modules. */
export const fragment = "fn fsMain() -> vec4f { return vec4f(0.1,0.1,0.1,1.0); }"
export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  return runScreenSpaceLab(canvas, "sss", sssShaders, options)
}
export const sss: ExampleSpec = {
  id: "sss", status: "wip",
  label: "Subsurface scattering",
  copy: "Two-pass RGB diffusion of diffuse lighting, with sharp specular and material/depth edge guards. WebGPU.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
