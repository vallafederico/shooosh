/**
 * SDF icons — createItem + loadTexture of an icon distance field.
 *
 * How to use (baked SVG — preferred on sites):
 *   pnpm msdf -- icons/mark.svg --out public/msdf
 *   const tex = await loadTexture("/msdf/icons/mark.png")
 *   createItem(el, { texture: tex, shaders: { fragment }, … })
 *
 * This demo uses makeIconSdfCanvas (same 0.5-edge encoding) so the harness
 * needs no binary assets. Sample the red channel; soft-edge with spread.
 */

import {
  acquireLayer,
  createItem,
  GpuUnavailableError,
  loadTexture,
  releaseLayer,
} from "shooosh"
import { makeIconSdfCanvas, type IconKind } from "./make-sdf"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

const SPREAD = 24

export const fragment = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let widthPx = max(uUni.values0.y, 1.0);
  let spread = max(uUni.values0.z, 1.0);
  let sample = textureSample(uTexture, uSampler, vUv).r;
  let sd = sample - 0.5;
  let screenPxRange = max(spread * (widthPx / 256.0), 1.0);
  let alpha = clamp(sd * screenPxRange + 0.5, 0.0, 1.0);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let pulse = 0.85 + 0.15 * sin(t * 1.6 + vUv.x * 3.0);
  let fill = mix(acid, paper, vUv.y) * pulse;
  // Premultiplied — createItem blends ONE / ONE_MINUS_SRC_ALPHA.
  return vec4f(fill * alpha, alpha);
}
`

const ICONS: IconKind[] = ["mark", "arrow", "rings"]

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

    const cards = [...root.querySelectorAll<HTMLElement>("[data-icon]")]
    for (const [index, card] of cards.entries()) {
      const kind = ICONS[index % ICONS.length]!
      const tex = await loadTexture(makeIconSdfCanvas(kind, 256, SPREAD), {
        fit: "contain",
      })
      items.push(
        createItem(card, {
          texture: tex,
          shaders: { fragment },
          onFrame(self, frame) {
            const rect = card.getBoundingClientRect()
            self.setUni({
              value1: frame.now * 0.001 + index,
              value2: Math.max(rect.width, 1),
              value3: SPREAD,
              value4: Math.max(rect.height, 1),
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
      for (const item of items) item.destroy()
      items.length = 0
      if (acquired) releaseLayer()
      acquired = false
    },
    ready,
  }
}

export const sdfIcons: ExampleSpec = {
  id: "sdf-icons",
  label: "SDF icons",
  copy: "Transparent SDF icons on createItem. Bake SVGs with shooosh/msdf; demo is procedural.",
  fragment,
  kind: "sdf-icons",
  run: (target, options) => run(target, options),
}
