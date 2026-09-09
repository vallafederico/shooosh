/**
 * Copy this file, its sibling .wgsl, handle.ts, types.ts and shaders.d.ts.
 * value1 = seconds; value2 = framebuffer aspect. DPR capped at 1 for ray cost.
 * Reduced motion holds time at zero. No external textures or runtime dependencies.
 */
import shader, { fragment } from "./raymarch-lights.wgsl"
import { createCanvasScene } from "shooosh"
import { fromScene } from "./handle"
import type { ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}) {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  let seconds = 0
  const scene = createCanvasScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1 },
    onInitError: options.onInitError,
    screen: {
      shaders: shader,
      uni: { value1: 0, value2: 1 },
      onFrame(self, frame) {
        if (!reducedMotion.matches) seconds += Math.min(frame.delta, 50) * 0.001
        self.setUni({
          value1: reducedMotion.matches ? 0 : seconds,
          value2: frame.canvas.width / Math.max(1, frame.canvas.height),
        })
      },
    },
  })
  return fromScene(scene)
}

export const raymarchLights: ExampleSpec = {
  id: "raymarch-lights",
  label: "Raymarch lights",
  copy: "A sphere and standing torus lit by moving amber and cyan lights, with soft shadows and ambient occlusion.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
