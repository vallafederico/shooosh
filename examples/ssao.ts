/** WIP — experimental demo, not a finished production recipe.
 * Screen-space ambient occlusion. Copy this file, ssao-shaders.ts, screen-space-scene.ts,
 * screen-space-lab.ts and types.ts. See screen-space-effects.md for the pass graph,
 * parameters, limits and profiling. No package internals or extra dependencies.
 */
import { runScreenSpaceLab } from "./screen-space-lab"
import { ssaoShaders } from "./ssao-shaders"
import type { ExampleRunOptions, ExampleSpec } from "./types"
/** Converter fixture only; live rendering uses the full WGSL compute modules. */
export const fragment = "fn fsMain() -> vec4f { return vec4f(0.1,0.1,0.1,1.0); }"
export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  return runScreenSpaceLab(canvas, "ssao", ssaoShaders, options)
}
export const ssao: ExampleSpec = {
  id: "ssao", status: "wip",
  label: "Screen-space ambient occlusion",
  copy: "Depth-projected AO, half-resolution sampling, bilateral denoise and edge-aware upsampling. WebGPU.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
