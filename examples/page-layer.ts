/**
 * Shared page-behind canvas + DOM-tracked quads.
 *
 * When: several modules on one page, a Webflow embed, or you do not own a
 * scene object. Same idea as acquireLayer in isolated widgets.
 * Backend: WebGPU → WebGL2. `null` means leave the page readable.
 *
 * How to use: the element must be transparent where the shader should show.
 * An opaque body background hides the layer. Pair every acquire with a release.
 *
 * Docs: docs/getting-started.md · docs/site-patterns.md · skill shooosh-item
 */

import { acquireLayer, createItem, releaseLayer } from "shooosh"

const fragment = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  let n = sin((vUv.x + vUv.y) * 12.0 + t * 2.0)
  return vec4f(mix(vec3f(0.85, 1.0, 0.24), vec3f(0.93, 0.91, 0.86), n * 0.5 + 0.5), 1.0)
}
`

export async function mount(element: HTMLElement) {
  const engine = await acquireLayer()
  if (!engine) return () => {}

  const item = createItem(element, {
    shaders: { fragment },
    onFrame(self, frame) {
      self.setUni({ value1: frame.now * 0.001 })
    },
  })

  return () => {
    item.destroy()
    releaseLayer()
  }
}
