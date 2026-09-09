import shader, { fragment } from "./fxaa.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * FXAA only — sharp SDF spokes + createPostProcessor.
 *
 * How to use:
 *   import { createCanvasScene as createScene, createPostProcessor } from "shooosh"
 *   import { fxaaEffect, fxaaEffectWgsl } from "./post-shaders"
 *   const scene = createScene(canvas, {
 *     screen: { shaders: shader, onFrame(...) },
 *   })
 *   await scene.getInitPromise()
 *   const post = createPostProcessor()
 *   post.addFragmentEffect({
 *     fragmentShader: fxaaEffect,
 *     fragmentShaderWgsl: fxaaEffectWgsl,
 *     uni: { value1: 1, value2: 0.125 },
 *   })
 *
 * Aliased core (hard `step` edges) so AA is easy to A/B — toggle strength to 0
 * in uni to see the jaggies return. Looks live in examples/post-shaders.ts.
 */

import { createPostProcessor, createCanvasScene as createScene } from "shooosh"
import type { PostProcessor } from "shooosh"
import { fromScene } from "./handle"
import { fxaaEffect, fxaaEffectWgsl } from "./post-shaders"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  let post: PostProcessor | null = null
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

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(() => {
    const engine = scene.getEngine()
    if (!engine) return null
    post = createPostProcessor()
    post.addFragmentEffect({
      fragmentShader: fxaaEffect,
      fragmentShaderWgsl: fxaaEffectWgsl,
      uni: { value1: 1, value2: 0.125 },
    })
    return engine.backend
  })

  const handle = fromScene(scene, () => {
    post?.destroy()
    post = null
  })
  return {
    ...handle,
    ready,
  }
}

export const fxaa: ExampleSpec = {
  id: "fxaa",
  label: "FXAA",
  copy: "createPostProcessor + fxaaEffect from post-shaders. Hard-step core shows the AA.",
  post: "fxaa",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
