/**
 * Mouse light — spotlight + ripples from the pointer.
 *
 * How to use:
 *   import { createScene, createMouseMonad } from "shooosh"
 *   const mouse = createMouseMonad({ element: canvas, easing: 0.14 })
 *   createScene(canvas, {
 *     screen: {
 *       shaders: { fragment },
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

import { createMouseMonad, createScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let mouse = vec2f(uUni.values0.y, uUni.values0.z);
  let p = vUv - mouse;
  let d = length(p);
  let spot = exp(-d * d * 16.0);
  let rip = sin(d * 36.0 - t * 5.0) * exp(-d * 4.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.12 + 0.2 * vUv.y);
  color = mix(color, acid, spot * 0.85 + rip * 0.25);
  return vec4f(color, 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const mouse = createMouseMonad({ element: canvas, easing: 0.14 })
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    screen: {
      shaders: { fragment },
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
