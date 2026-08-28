/**
 * Gradient — vUv as color, one uniform for time.
 *
 * How to use:
 *   import { createScene } from "shooosh"
 *   const scene = createScene(canvas, {
 *     screen: {
 *       shaders: { fragment },
 *       onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *     },
 *   })
 *
 * value1 = seconds. Smallest useful fsMain.
 */

import { createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let g = mix(ink, paper, vUv.y);
  let band = smoothstep(0.46, 0.5, vUv.x) * (1.0 - smoothstep(0.5, 0.54, vUv.x));
  let pulse = 0.65 + 0.35 * sin(t * 2.0);
  return vec4f(mix(g, acid, band * pulse), 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    screen: {
      shaders: { fragment },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
      },
    },
  })
  return fromScene(scene)
}

export const gradient: ExampleSpec = {
  id: "gradient",
  label: "Gradient",
  copy: "createScene + vUv as a gradient. A thin acid stripe pulses on time — the smallest useful fsMain.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
