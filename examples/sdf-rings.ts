import shader, { fragment } from "./sdf-rings.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * SDF rings — signed distance to a circle, concentric pulses.
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
 * Icons / buttons / loader marks. 0.5-at-edge is the same encoding as shooosh/msdf.
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

export const sdfRings: ExampleSpec = {
  id: "sdf-rings",
  label: "SDF rings",
  copy: "createScene + signed circle. Concentric pulses — same 0.5-at-edge idea as the MSDF atlases.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
