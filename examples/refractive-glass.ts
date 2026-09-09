import shader, { fragment } from "./refractive-glass.wgsl"
/**
 * Transparent refractive glass over an example-owned procedural backdrop.
 * Copy run(canvas), or reuse the WGSL material with your own backdrop sampler.
 * This is screen-space refraction, not capture of HTML behind the canvas.
 * No textures, post stack, dependencies or continuous time animation required.
 * value5/6 = pitch/yaw radians; value2/3 = pointer UV; value9 = aspect; value10 = reciprocal framebuffer pixel height (1 / height).
 */
import { createMouseMonad, createCanvasScene as createScene } from "shooosh"
import { createSpinner } from "shooosh/utility"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  const spinner = createSpinner({ element: canvas, inertia: !reducedMotion.matches })
  const previousTouchAction = canvas.style.touchAction
  const previousCursor = canvas.style.cursor
  canvas.style.touchAction = "none"
  canvas.style.cursor = "grab"
  const reset = () => spinner.reset()
  canvas.addEventListener("dblclick", reset)
  const mouse = createMouseMonad({ element: canvas, easing: 0.2 })
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 2 },
    onInitError: options.onInitError,
    screen: {
      shaders: shader,
      uni: { value2: 0.5, value3: 0.5, value9: 1, value10: 0.001 },
      onFrame(self, frame) {
        const rotation = spinner.update(frame.delta / 1000)
        const cursor = rotation.dragging ? "grabbing" : "grab"
        if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor
        const pointer = mouse.update()
        self.setUni({
          value2: reducedMotion.matches ? 0.5 : pointer.x * 0.5 + 0.5,
          value3: reducedMotion.matches ? 0.5 : pointer.y * 0.5 + 0.5,
          value5: rotation.x,
          value6: rotation.y,
          value9: frame.canvas.width / Math.max(1, frame.canvas.height),
          value10: 1 / Math.max(1, frame.canvas.height),
        })
      },
    },
  })
  return fromScene(scene, () => {
    mouse.destroy()
    spinner.destroy()
    canvas.removeEventListener("dblclick", reset)
    canvas.style.touchAction = previousTouchAction
    canvas.style.cursor = previousCursor
  })
}

export const refractiveGlass: ExampleSpec = {
  id: "refractive-glass",
  label: "Refractive glass",
  copy: "Transparent rounded glass, bevel refraction and chromatic edges over a procedural backdrop. Drag to spin; release to coast. Double-click to reset. Procedural backdrop, no HTML capture.",
  pointer: true,
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
