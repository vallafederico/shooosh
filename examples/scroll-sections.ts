/**
 * Scroll sections — full-width bands track DOM rects while the page scrolls.
 *
 * How to use: same acquireLayer + createItem pattern as scroll-cards / item-fill.
 * Large rects (not only small cards) stick to their elements through scroll.
 */

import {
  acquireLayer,
  createItem,
  GpuUnavailableError,
  releaseLayer,
} from "shooosh"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let band = uUni.values0.y;
  let p = vUv * 2.0 - 1.0;
  let wave = sin(p.x * 8.0 + t * 1.8 + band * 2.0) * 0.5 + 0.5;
  let stripe = smoothstep(0.35, 0.65, fract(vUv.y * 4.0 + t * 0.15 + band));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.12 + 0.2 * wave);
  color = mix(color, acid, stripe * 0.55 * (0.4 + 0.6 * wave));
  return vec4f(color, 1.0);
}
`

export function run(root: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  const items: ReturnType<typeof createItem>[] = []
  let acquired = false
  let released = false

  const ready = acquireLayer({ backend: options.backend ?? "auto" }).then((engine) => {
    if (released) {
      if (engine) releaseLayer()
      return null
    }
    if (!engine) {
      options.onInitError?.(new GpuUnavailableError())
      return null
    }
    acquired = true
    for (const [index, section] of [
      ...root.querySelectorAll<HTMLElement>("[data-plane]"),
    ].entries()) {
      items.push(
        createItem(section, {
          shaders: { fragment },
          onFrame(self, frame) {
            self.setUni({
              value1: frame.now * 0.001,
              value2: index * 1.1,
            })
          },
        }),
      )
    }
    return engine.backend
  })

  return {
    destroy() {
      released = true
      items.forEach((item) => item.destroy())
      if (acquired) releaseLayer()
    },
    ready,
  }
}

export const scrollSections: ExampleSpec = {
  id: "scroll-sections",
  label: "Scroll sections",
  copy: "Full-width section bands via createItem. Scroll to see large rects track.",
  kind: "scroll-sections",
  fragment,
  run,
}
