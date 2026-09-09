import shader, { fragment } from "./item-fill.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Card fill — acquireLayer + createItem, SDF capsule in the element's vUv.
 *
 * How to use:
 *   import { acquireLayer, createItem, releaseLayer } from "shooosh"
 *   const engine = await acquireLayer()
 *   if (!engine) return
 *   const item = createItem(card, {
 *     shaders: shader,
 *     onFrame(self, frame) { self.setUni({ value1: frame.now * 0.001 }) },
 *   })
 *   // later: item.destroy(); releaseLayer()
 *
 * vUv is the DOM box, not the page. Two cards, same shader, offset time.
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
            self.setUni({ value1: frame.now * 0.001 + index })
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

export const itemFill: ExampleSpec = {
  id: "item-fill",
  label: "Card fill",
  copy: "acquireLayer + createItem. SDF capsule in the element's own vUv — how we fill cards.",
  kind: "items",
  fragment,
  run,
}
