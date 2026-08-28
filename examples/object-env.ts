/**
 * Object + env map — createObject cube sampling uEnvMap from loadTexture.
 *
 * How to use:
 *   const env = await loadTexture(makeEnvCanvas(), { flipY: false })
 *   createObject(null, {
 *     shape: "cube",
 *     envMap: env.texture, // TextureHandle — or pass the whole loader result
 *     shaders: { fragment }, // sample uEnvMap / uSampler
 *   })
 */

import { createObject, createScene, loadTexture } from "shooosh"
import { makeEnvCanvas } from "./make-texture"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let n = normalize(vNormal);
  let uv = n.xy * 0.5 + vec2f(0.5);
  let env = textureSample(uEnvMap, uSampler, uv).rgb;
  let rim = pow(1.0 - clamp(n.z * 0.5 + 0.5, 0.0, 1.0), 1.6);
  let ink = vec3f(0.047, 0.047, 0.043);
  return vec4f(mix(ink, env, 0.85 + rim * 0.15), 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  let object: ReturnType<typeof createObject> | null = null

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(async () => {
    const engine = scene.getEngine()
    if (!engine) return null
    const env = await loadTexture(makeEnvCanvas(512), { flipY: false })
    object = createObject(null, {
      shape: "cube",
      placement: { centerX: 0, centerY: 0, scale: 1.4 },
      envMap: env.texture,
      shaders: { fragment },
      onFrame(self, frame) {
        const t = frame.now * 0.001
        self.setTransform({
          rotationY: t * 0.55,
          rotationX: 0.4 + Math.sin(t * 0.4) * 0.2,
        })
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

export const objectEnv: ExampleSpec = {
  id: "object-env",
  label: "Object env",
  copy: "createObject + loadTexture envMap. Fragment samples uEnvMap. Both backends.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
