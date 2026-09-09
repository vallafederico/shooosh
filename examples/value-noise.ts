import shader, { fragment } from "./value-noise.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Value noise — hash + bilinear interpolate, then a cheap fbm.
 *
 * How to use:
 *   import { createCanvasScene as createScene } from "shooosh"
 *   createScene(canvas, {
 *     screen: {
 *       shaders: shader,
 *       onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *     },
 *   })
 *
 * Site grain / fog / paper texture. value1 = seconds.
 */

import { createCanvasScene as createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    screen: {
      shaders: shader,
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
      },
    },
  })
  return fromScene(scene)
}

export const valueNoise: ExampleSpec = {
  id: "value-noise",
  label: "Value noise",
  copy: "createScene + hash21 → value noise → fbm. The grain / fog / paper field.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
