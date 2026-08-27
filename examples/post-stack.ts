/**
 * Bloom + grain on a dedicated canvas.
 *
 * When: marketing hero that needs a little glow and film grain.
 * Backend: WebGL2. On WebGPU the post list is skipped; the screen still runs.
 *
 * Post is a different contract from fsMain. Presets: effects.bloom / bw / noise.
 *
 * Docs: docs/site-patterns.md · skill shooosh-post
 */

import { createScene, effects } from "shooosh"

const fragment = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  let p = vUv * 2.0 - 1.0
  let glow = exp(-dot(p, p) * 2.2)
  let ink = vec3f(0.05, 0.05, 0.04)
  let acid = vec3f(0.85, 1.0, 0.24)
  return vec4f(mix(ink, acid, glow * (0.7 + 0.3 * sin(t))), 1.0)
}
`

export function mount(canvas: HTMLCanvasElement) {
  const scene = createScene(canvas, {
    dpr: { max: 1.5 },
    post: [
      effects.bloom({ intensity: 0.7, threshold: 0.55 }),
      effects.noise({ amount: 0.08 }),
    ],
    screen: {
      shaders: { fragment },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
      },
    },
    onInitError: (error) => console.error("[shooosh]", error),
  })

  return () => scene.destroy()
}
