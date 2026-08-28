/**
 * Bloom + grain (+ optional FXAA) — emissive fsMain + createPostProcessor.
 *
 * How to use:
 *   import { createScene, createPostProcessor } from "shooosh"
 *   import {
 *     bloomEffect, bloomEffectWgsl,
 *     fxaaEffect, fxaaEffectWgsl,
 *     grainEffect, grainEffectWgsl,
 *   } from "./post-shaders"
 *   const scene = createScene(canvas, {
 *     screen: { shaders: { fragment }, onFrame(...) },
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

import { createPostProcessor, createScene } from "shooosh"
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

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let glow = exp(-dot(p, p) * 2.4);
  let ring = exp(-abs(length(p) - 0.45 + 0.04 * sin(t * 2.0)) * 18.0);
  let ink = vec3f(0.02, 0.02, 0.018);
  let acid = vec3f(0.847, 1.0, 0.243);
  return vec4f(mix(ink, acid, glow * 0.95 + ring * 0.65), 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  let post: PostProcessor | null = null
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
