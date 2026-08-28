/**
 * Textured plane — loadTexture after init, sample uTexture in fsMain.
 *
 * How to use:
 *   const scene = createScene(canvas, { screen: { shaders: { fragment } } })
 *   await scene.getInitPromise()
 *   const tex = await loadTexture(makePaperCanvas())
 *   scene.configureScreen({ texture: tex })
 *   // fragment: textureSample(uTexture, uSampler, fitUv(vUv))
 *
 * Load textures after the engine resolves so the upload picks the live backend.
 */

import { createScene, loadTexture } from "shooosh"
import { fromScene } from "./handle"
import { makePaperCanvas } from "./make-texture"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let uv = fitUv(vUv);
  let warp = uv + 0.012 * vec2f(sin(uv.y * 12.0 + t), cos(uv.x * 10.0 - t));
  let sample = textureSample(uTexture, uSampler, warp);
  let ink = vec3f(0.047, 0.047, 0.043);
  let edge = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  return vec4f(mix(ink, sample.rgb, edge), 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    onInitError: options.onInitError,
    screen: {
      shaders: { fragment },
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
