/**
 * Run a catalog example through the public shooosh API.
 *
 * How to use (harness / a local page):
 *   const stop = mountExample(plasma, stage)
 *
 * Screen examples: createScene + fsMain.
 * Item examples: acquireLayer + createItem.
 * Pointer examples write value2/value3 as top-origin UV (same as vUv).
 */

import {
  acquireLayer,
  createItem,
  createScene,
  effects,
  GpuUnavailableError,
  releaseLayer,
  type RendererKind,
} from "shooosh"
import type { ExampleSpec } from "./types"

export type MountExampleOptions = {
  backend?: "auto" | "webgpu" | "webgl2"
  onBackend?: (kind: RendererKind | null) => void
  onError?: (error: unknown) => void
}

function pointerUv(el: HTMLElement, event: PointerEvent) {
  const rect = el.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / w)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / h)),
  }
}

function caption(stage: HTMLElement, spec: ExampleSpec) {
  const overlay = document.createElement("div")
  overlay.className = "overlay"
  overlay.innerHTML = `<h1>${spec.label}</h1><p>${spec.copy}</p>`
  stage.append(overlay)
}

export function mountExample(
  spec: ExampleSpec,
  stage: HTMLElement,
  options: MountExampleOptions = {},
) {
  caption(stage, spec)
  const backend = options.backend ?? "auto"

  if (spec.kind === "items") {
    let released = false
    let acquired = false
    const items: ReturnType<typeof createItem>[] = []
    const wrap = document.createElement("div")
    wrap.className = "cards"
    wrap.innerHTML = `<div class="card" data-card></div><div class="card" data-card></div>`
    stage.append(wrap)

    void acquireLayer({ backend }).then((engine) => {
      if (released) {
        if (engine) releaseLayer()
        return
      }
      if (!engine) {
        options.onError?.(new GpuUnavailableError())
        options.onBackend?.(null)
        return
      }
      acquired = true
      options.onBackend?.(engine.backend)
      for (const [index, card] of [
        ...wrap.querySelectorAll<HTMLElement>("[data-card]"),
      ].entries()) {
        items.push(
          createItem(card, {
            shaders: { fragment: spec.fragment },
            onFrame(self, frame) {
              self.setUni({ value1: frame.now * 0.001 + index })
            },
          }),
        )
      }
    })

    return () => {
      released = true
      items.forEach((item) => item.destroy())
      if (acquired) releaseLayer()
    }
  }

  const canvas = document.createElement("canvas")
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  stage.append(canvas)

  let pointerX = 0.5
  let pointerY = 0.5
  const onPointer = (event: PointerEvent) => {
    const uv = pointerUv(canvas, event)
    pointerX = uv.x
    pointerY = uv.y
  }
  if (spec.pointer) canvas.addEventListener("pointermove", onPointer)

  const scene = createScene(canvas, {
    backend,
    dpr: { max: 1.5 },
    onInitError: options.onError,
    post:
      spec.post === "grain-bloom"
        ? [effects.bloom({ intensity: 0.75, threshold: 0.5 }), effects.noise({ amount: 0.07 })]
        : undefined,
    screen: {
      shaders: { fragment: spec.fragment },
      onFrame(self, frame) {
        self.setUni({
          value1: frame.now * 0.001,
          value2: pointerX,
          value3: pointerY,
        })
      },
    },
  })

  void scene.getInitPromise()?.then(() => {
    options.onBackend?.(scene.getEngine()?.backend ?? null)
  })

  return () => {
    if (spec.pointer) canvas.removeEventListener("pointermove", onPointer)
    scene.destroy()
  }
}
