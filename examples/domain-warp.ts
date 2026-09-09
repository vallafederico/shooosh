import shader, { fragment } from "./domain-warp.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Domain warp — noise the sample position, then color by the warped UV.
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
 * Liquid / oil / marble backgrounds. value1 = seconds.
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

export const domainWarp: ExampleSpec = {
  id: "domain-warp",
  label: "Domain warp",
  copy: "createScene + noise-warped UVs, then color the warped space. Liquid / marble heroes.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
