/**
 * Bloom + grain — a bright fsMain through the WebGL2 post stack.
 *
 * How to use:
 *   import { createScene, effects } from "shooosh"
 *   createScene(canvas, {
 *     post: [
 *       effects.bloom({ intensity: 0.75, threshold: 0.5 }),
 *       effects.noise({ amount: 0.07 }),
 *     ],
 *     screen: {
 *       shaders: { fragment },
 *       onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *     },
 *   })
 *
 * The fragment is still fsMain. Bloom/noise are applyEffect presets, not fsMain.
 * WebGPU: post is skipped; the emissive shader still runs.
 */

import { createScene, effects } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let glow = exp(-dot(p, p) * 2.4);
  let ring = exp(-abs(length(p) - 0.45 + 0.04 * sin(t * 2.0)) * 18.0);
  let ink = vec3f(0.02, 0.02, 0.018);
  let acid = vec3f(0.847, 1.0, 0.243);
  return vec4f(mix(ink, acid, glow * 0.95 + ring * 0.65), 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    post: [
      effects.bloom({ intensity: 0.75, threshold: 0.5 }),
      effects.noise({ amount: 0.07 }),
    ],
    screen: {
      shaders: { fragment },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
      },
    },
  })
  return fromScene(scene)
}

export const grainBloom: ExampleSpec = {
  id: "grain-bloom",
  label: "Bloom + grain",
  copy: "createScene with effects.bloom + effects.noise on a hot fsMain. Post is WebGL2-only today.",
  post: "grain-bloom",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
