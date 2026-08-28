/**
 * Scroll cards — tall page + acquireLayer; planes stick to DOM while scrolling.
 *
 * How to use:
 *   const engine = await acquireLayer()
 *   if (!engine) return
 *   for (const card of root.querySelectorAll("[data-card]")) {
 *     createItem(card, { shaders: { fragment }, onFrame(...) })
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

export const fragment = `fn sdRoundedBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let id = uUni.values0.y;
  let p = vUv * 2.0 - 1.0;
  let d = sdRoundedBox(p, vec2f(0.82, 0.72), 0.18);
  let fill = 1.0 - smoothstep(-0.02, 0.02, d);
  let edge = 1.0 - smoothstep(0.0, 0.03, abs(d));
  let bands = sin((vUv.x * 6.0 + vUv.y * 4.0) + t * 1.4 + id);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.1);
  color = mix(color, mix(acid, paper, bands * 0.5 + 0.5), fill * 0.92);
  color = mix(color, paper, edge * 0.65);
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
