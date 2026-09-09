import shader, { fragment } from "./gradient.wgsl"
/**
 * Shader data comes from .wgsl build imports; see docs/shader-build.md.
 * Gradient — vUv as color, one uniform for time.
 *
 * How to use:
 *   import { createCanvasScene as createScene } from "shooosh"
 *   const scene = createScene(canvas, {
 *     screen: {
 *       shaders: shader,
 *       onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *     },
 *   })
 *
 * value1 = seconds. Smallest useful fsMain.
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

export const gradient: ExampleSpec = {
  id: "gradient",
  label: "Gradient",
  copy: "createScene + vUv as a gradient. A thin acid stripe pulses on time — the smallest useful fsMain.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
