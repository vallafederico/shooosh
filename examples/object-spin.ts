import shader, { fragment } from "./object-spin.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Object spin — createObject with a rounded box + lit WGSL material.
 *
 * How to use:
 *   await scene.getInitPromise()
 *   createObject(null, {
 *     shape: { type: "roundedBox", width: 1.2, height: 1.2, depth: 1.2, rounding: 0.18 },
 *     placement: { centerX: 0, centerY: 0, scale: 1.4 },
 *     shaders: shader,
 *     onFrame(self, frame) { self.setTransform({ rotationY: … }) },
 *   })
 *
 * For a GLB: const [mesh] = await loadGlb(url); shape: { type: "custom", ...mesh }
 */

import { createObject, createCanvasScene as createScene } from "shooosh"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  let object: ReturnType<typeof createObject> | null = null

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(() => {
    const engine = scene.getEngine()
    if (!engine) return null
    object = createObject(null, {
      shape: {
        type: "roundedBox",
        width: 1.15,
        height: 1.15,
        depth: 1.15,
        rounding: 0.16,
      },
      placement: { centerX: 0, centerY: 0.02, scale: 1.45 },
      shaders: shader,
      onFrame(self, frame) {
        const t = frame.now * 0.001
        self.setTransform({
          rotationY: t * 0.7,
          rotationX: 0.35 + Math.sin(t * 0.55) * 0.15,
        })
        self.setUni({ value1: t })
      },
    })
    return engine.backend
  })

  return {
    destroy() {
      object?.destroy()
      object = null
      scene.destroy()
    },
    ready,
  }
}

export const objectSpin: ExampleSpec = {
  id: "object-spin",
  label: "Object spin",
  copy: "createObject roundedBox + lit WGSL. setTransform each frame. Both backends.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
