/**
 * FXAA only — sharp SDF spokes + createPostProcessor.
 *
 * How to use:
 *   import { createScene, createPostProcessor } from "shooosh"
 *   import { fxaaEffect, fxaaEffectWgsl } from "./post-shaders"
 *   const scene = createScene(canvas, {
 *     screen: { shaders: { fragment }, onFrame(...) },
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

import { createPostProcessor, createScene } from "shooosh"
import type { PostProcessor } from "shooosh"
import { fromScene } from "./handle"
import { fxaaEffect, fxaaEffectWgsl } from "./post-shaders"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let r = length(p);
  let spokes = abs(sin((p.x * 9.0 + p.y * 7.0) + t * 2.5));
  let ripples = abs(sin(r * 36.0 - t * 3.5));
  let hard = max(step(0.94, spokes), step(0.96, ripples));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  return vec4f(mix(paper, mix(ink, acid, hard), hard), 1.0);
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
