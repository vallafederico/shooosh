import shader, { fragment } from "./scroll-sections.wgsl"
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

export { fragment }


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
          shaders: shader,
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
