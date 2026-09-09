import shader, { fragment } from "./mouse-light.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Mouse light — spotlight + ripples from the pointer.
 *
 * How to use:
 *   import { createCanvasScene as createScene, createMouseMonad } from "shooosh"
 *   const mouse = createMouseMonad({ element: canvas, easing: 0.14 })
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
 * createMouseMonad is −1..1 (center origin). Remap to 0..1 top-origin for vUv.
 * value1 = seconds. value2 / value3 = pointer UV.
 */

import { createMouseMonad, createCanvasScene as createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const mouse = createMouseMonad({ element: canvas, easing: 0.14 })
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

export const mouseLight: ExampleSpec = {
  id: "mouse-light",
  label: "Mouse light",
  copy: "createScene + createMouseMonad. Pointer UV as value2/value3 — spotlight plus ripples.",
  pointer: true,
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
