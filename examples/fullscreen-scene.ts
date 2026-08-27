/**
 * Dedicated canvas — section hero or a page that owns its GPU surface.
 *
 * When: one <canvas> you control. Not a page-behind layer.
 * Backend: WebGPU if the probe allows, else WebGL2.
 *
 * How to use: pass your canvas, call mount(), destroy on unmount.
 *
 * Docs: docs/getting-started.md · skill shooosh-site
 */

import { createScene } from "shooosh"

const fragment = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  let p = vUv * 2.0 - 1.0
  let r = length(p)
  let wave = 0.5 + 0.5 * sin(r * 10.0 - t)
  return vec4f(vUv, wave, 1.0)
}
`

export function mount(canvas: HTMLCanvasElement) {
  const scene = createScene(canvas, {
    dpr: { max: 1.5 },
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
