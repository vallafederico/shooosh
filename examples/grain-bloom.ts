import shader, { fragment } from "./grain-bloom.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Bloom + grain (+ optional FXAA) — emissive fsMain + createPostProcessor.
 *
 * How to use:
 *   import { createCanvasScene as createScene, createPostProcessor } from "shooosh"
 *   import {
 *     bloomEffect, bloomEffectWgsl,
 *     fxaaEffect, fxaaEffectWgsl,
 *     grainEffect, grainEffectWgsl,
 *   } from "./post-shaders"
 *   const scene = createScene(canvas, {
 *     screen: { shaders: shader, onFrame(...) },
 *   })
 *   await scene.getInitPromise()
 *   const post = createPostProcessor()
 *   post.addFragmentEffect({
 *     fragmentShader: bloomEffect,
 *     fragmentShaderWgsl: bloomEffectWgsl,
 *     uni: { value1: 0.75, value2: 0.5, value3: 1.5 },
 *   })
 *   // Optional AA — omit this block to skip:
 *   post.addFragmentEffect({
 *     fragmentShader: fxaaEffect,
 *     fragmentShaderWgsl: fxaaEffectWgsl,
 *     uni: { value1: 1, value2: 0.125 },
 *   })
 *
 * Looks live in examples/post-shaders.ts — not package presets. Passing both
 * variants runs the same chain on WebGPU and WebGL2.
 */

import { createPostProcessor, createCanvasScene as createScene } from "shooosh"
import type { PostProcessor } from "shooosh"
import { fromScene } from "./handle"
import {
  bloomEffect,
  bloomEffectWgsl,
  fxaaEffect,
  fxaaEffectWgsl,
  grainEffect,
  grainEffectWgsl,
} from "./post-shaders"
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
      fragmentShader: bloomEffect,
      fragmentShaderWgsl: bloomEffectWgsl,
      uni: { value1: 0.75, value2: 0.5, value3: 1.5 },
    })
    // Optional FXAA — after bloom, before grain so noise stays crisp.
    post.addFragmentEffect({
      fragmentShader: fxaaEffect,
      fragmentShaderWgsl: fxaaEffectWgsl,
      uni: { value1: 1, value2: 0.125 },
    })
    post.addFragmentEffect({
      fragmentShader: grainEffect,
      fragmentShaderWgsl: grainEffectWgsl,
      uni: { value1: 0.07, value2: 520 },
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

export const grainBloom: ExampleSpec = {
  id: "grain-bloom",
  label: "Bloom + grain",
  copy: "createPostProcessor + bloom / optional FXAA / grain from examples/post-shaders.",
  post: "grain-bloom",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
