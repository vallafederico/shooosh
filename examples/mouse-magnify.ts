import shader, { fragment } from "./mouse-magnify.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Mouse magnify — zoom the domain around the pointer.
 *
 * How to use:
 *   import { createCanvasScene as createScene, createMouseMonad } from "shooosh"
 *   const mouse = createMouseMonad({ element: canvas, easing: 0.16 })
 *   createScene(canvas, {
 *     screen: {
 *       shaders: shader,
 *       onFrame(self, frame) {
 *         const m = mouse.update()
 *         self.setUni({
 *           value1: frame.now * 0.001,
 *           value2: m.x * 0.5 + 0.5,
 *           value3: m.y * 0.5 + 0.5,
 *         })
 *       },
 *     },
 *   })
 *
 * Same pointer packing as mouse-light. The lens is in fsMain (no post texture).
 */

import { createMouseMonad, createCanvasScene as createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const mouse = createMouseMonad({ element: canvas, easing: 0.16 })
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    screen: {
      shaders: shader,
      onFrame(self, frame) {
        const m = mouse.update()
        self.setUni({
          value1: frame.now * 0.001,
          value2: m.x * 0.5 + 0.5,
          value3: m.y * 0.5 + 0.5,
        })
      },
    },
  })
  return fromScene(scene, () => mouse.destroy())
}

export const mouseMagnify: ExampleSpec = {
  id: "mouse-magnify",
  label: "Mouse magnify",
  copy: "createScene + createMouseMonad. Zoom the domain around the cursor — a lens in fsMain.",
  pointer: true,
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
