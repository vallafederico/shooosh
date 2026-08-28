/**
 * Card fill — acquireLayer + createItem, SDF capsule in the element's vUv.
 *
 * How to use:
 *   import { acquireLayer, createItem, releaseLayer } from "shooosh"
 *   const engine = await acquireLayer()
 *   if (!engine) return
 *   const item = createItem(card, {
 *     shaders: { fragment },
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

export const fragment = `fn sdCapsule(p: vec2f, radius: f32) -> f32 {
  let a = vec2f(0.5, 0.28);
  let b = vec2f(0.5, 0.72);
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let d = sdCapsule(vUv, 0.16);
  let fill = 1.0 - smoothstep(-0.01, 0.01, d);
  let edge = 1.0 - smoothstep(0.0, 0.02, abs(d));
  let n = sin((vUv.x + vUv.y) * 18.0 + t * 2.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.08);
  color = mix(color, mix(acid, paper, n * 0.5 + 0.5), fill);
  color = mix(color, paper, edge);
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
    for (const [index, card] of [
      ...root.querySelectorAll<HTMLElement>("[data-card]"),
    ].entries()) {
      items.push(
        createItem(card, {
          shaders: { fragment },
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
