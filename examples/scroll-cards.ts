import shader, { fragment } from "./scroll-cards.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Scroll cards — tall page + acquireLayer; planes stick to DOM while scrolling.
 *
 * How to use:
 *   const engine = await acquireLayer()
 *   if (!engine) return
 *   for (const card of root.querySelectorAll("[data-card]")) {
 *     createItem(card, { shaders: shader, onFrame(...) })
 *   }
 *   // later: items.destroy(); releaseLayer()
 *
 * getBoundingClientRect → clip space each frame. Scroll marks the settle loop dirty.
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
    for (const [index, card] of [
      ...root.querySelectorAll<HTMLElement>("[data-card]"),
    ].entries()) {
      items.push(
        createItem(card, {
          shaders: shader,
          onFrame(self, frame) {
            self.setUni({
              value1: frame.now * 0.001,
              value2: index * 0.7,
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

export const scrollCards: ExampleSpec = {
  id: "scroll-cards",
  label: "Scroll cards",
  copy: "Tall page + createItem. Scroll — planes follow getBoundingClientRect.",
  kind: "scroll-items",
  fragment,
  run,
}
