import shader, { fragment } from "./grid.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Grid — graph-paper lines in vUv. Common page texture / overlay.
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
 * value1 = seconds (drives a slow pulse on the major lines).
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

export const grid: ExampleSpec = {
  id: "grid",
  label: "Grid",
  copy: "createScene + a graph-paper field in vUv. Fine cells, pulsing major lines.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
