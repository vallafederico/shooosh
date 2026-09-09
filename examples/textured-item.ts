import shader, { fragment } from "./textured-item.wgsl"
/**
 * Copy the sibling .wgsl shader; use shooosh/build in your bundler.
 * Textured cards — acquireLayer + createItem with a shared loadTexture atlas.
 *
 * How to use:
 *   const engine = await acquireLayer()
 *   const tex = await loadTexture(makePaperCanvas())
 *   createItem(card, { texture: tex, shaders: shader, … })
 *   // fragment: textureSample(uTexture, uSampler, fitUv(vUv))
 */

import {
  acquireLayer,
  createItem,
  GpuUnavailableError,
  loadTexture,
  releaseLayer,
} from "shooosh"
import { makePaperCanvas } from "./make-texture"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(root: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  const items: ReturnType<typeof createItem>[] = []
  let acquired = false
  let released = false

  const ready = acquireLayer({ backend: options.backend ?? "auto" }).then(async (engine) => {
    if (released) {
      if (engine) releaseLayer()
      return null
    }
    if (!engine) {
      options.onInitError?.(new GpuUnavailableError())
      return null
    }
    acquired = true
    const tex = await loadTexture(makePaperCanvas(512), { fit: "cover" })
    for (const [index, card] of [
      ...root.querySelectorAll<HTMLElement>("[data-card]"),
    ].entries()) {
      items.push(
        createItem(card, {
          texture: tex,
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
      for (const item of items) item.destroy()
      items.length = 0
      if (acquired) releaseLayer()
      acquired = false
    },
    ready,
  }
}

export const texturedItem: ExampleSpec = {
  id: "textured-item",
  label: "Textured cards",
  copy: "acquireLayer + createItem({ texture }). fitUv cover on DOM cards.",
  fragment,
  kind: "items",
  run: (target, options) => run(target, options),
}
