import shader, { fragment } from "./textured-plane.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Textured plane — loadTexture after init, sample uTexture in fsMain.
 *
 * How to use:
 *   const scene = createScene(canvas, { screen: { shaders: shader } })
 *   await scene.getInitPromise()
 *   const tex = await loadTexture(makePaperCanvas())
 *   scene.configureScreen({ texture: tex })
 *   // fragment: textureSample(uTexture, uSampler, fitUv(vUv))
 *
 * Load textures after the engine resolves so the upload picks the live backend.
 */

import { createCanvasScene as createScene, loadTexture } from "shooosh"
import { fromScene } from "./handle"
import { makePaperCanvas } from "./make-texture"
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

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(async () => {
    const engine = scene.getEngine()
    if (!engine) return null
    const tex = await loadTexture(makePaperCanvas(768), { fit: "cover" })
    scene.configureScreen({ texture: tex })
    return engine.backend
  })

  const handle = fromScene(scene)
  return {
    ...handle,
    ready,
  }
}

export const texturedPlane: ExampleSpec = {
  id: "textured-plane",
  label: "Textured plane",
  copy: "loadTexture after init → fitUv(vUv) cover sampling. Both backends.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
