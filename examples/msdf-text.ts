/**
 * MSDF / SDF text — createMsdfGlyphs with a font atlas.
 *
 * How to use (baked — preferred on sites):
 *   pnpm msdf -- fonts/Inter.ttf --out public/msdf
 *   const json = await (await fetch("/msdf/fonts/Inter.json")).json()
 *   const tex = await loadTexture("/msdf/fonts/Inter.png")
 *   // pack bmfont chars → glyphData (dst + src rects), then:
 *   createMsdfGlyphs(el, {
 *     texture: tex,
 *     glyphData, glyphCount,
 *     distanceRange: 8,
 *     atlasWidth: tex.width,
 *     color: [0.85, 1, 0.25],
 *     alpha: 1,
 *     boxAspect: w / h,
 *     uni: { value2: w, value4: h },
 *   })
 *
 * This demo builds a tiny canvas→SDF atlas via makeDemoFontAtlas so the
 * harness needs no binary font. createMsdfGlyphs owns the median-of-three
 * coverage shader (not a custom fsMain).
 */

import {
  acquireLayer,
  createMsdfGlyphs,
  GpuUnavailableError,
  loadTexture,
  releaseLayer,
} from "shooosh"
import { makeDemoFontAtlas, packMsdfLine } from "./make-sdf"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

const TEXT = "shooosh"

/** Stub for converter tests — live coverage is inside createMsdfGlyphs. */
export const fragment = `fn fsMain() -> vec4f {
  let sample = textureSample(uTexture, uSampler, vUv).rgb;
  let sd = max(min(sample.r, sample.g), min(sample.b, sample.r)) - 0.5;
  let alpha = clamp(sd * 8.0 + 0.5, 0.0, 1.0);
  let acid = vec3f(0.847, 1.0, 0.243);
  return vec4f(acid * alpha, alpha);
}
`

export function run(root: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  let glyphs: ReturnType<typeof createMsdfGlyphs> | null = null
  let acquired = false
  let released = false
  let resizeObs: ResizeObserver | null = null

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

    const el = root.querySelector<HTMLElement>("[data-msdf]") ?? root
    const atlas = makeDemoFontAtlas(TEXT)
    const tex = await loadTexture(atlas.canvas)

    const layout = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.max(rect.width, 1)
      const h = Math.max(rect.height, 1)
      const packed = packMsdfLine(atlas, TEXT, w, h)
      if (!glyphs) {
        glyphs = createMsdfGlyphs(el, {
          texture: tex,
          glyphData: packed.glyphData,
          glyphCount: packed.glyphCount,
          distanceRange: atlas.distanceRange,
          atlasWidth: atlas.atlasWidth,
          color: [0.847, 1.0, 0.243],
          alpha: 1,
          boxAspect: packed.boxAspect,
          uni: { value2: w, value4: h },
        })
      } else {
        glyphs.setGlyphData(packed.glyphData, packed.glyphCount)
        glyphs.setUni({ value2: w, value4: h })
      }
    }

    layout()
    resizeObs = new ResizeObserver(layout)
    resizeObs.observe(el)
    return engine.backend
  })

  return {
    destroy() {
      released = true
      resizeObs?.disconnect()
      resizeObs = null
      glyphs?.destroy()
      glyphs = null
      if (acquired) releaseLayer()
      acquired = false
    },
    ready,
  }
}

export const msdfText: ExampleSpec = {
  id: "msdf-text",
  label: "MSDF text",
  copy: "createMsdfGlyphs + atlas. Bake fonts with shooosh/msdf; demo atlas is procedural.",
  fragment,
  kind: "msdf-text",
  run: (target, options) => run(target, options),
}
