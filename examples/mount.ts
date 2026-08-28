/**
 * Harness chrome around an example's own `run`.
 *
 * The example file is the real usage (createScene / createItem / createPostProcessor).
 * This file only adds a caption, a canvas or card rack, and backend callbacks.
 */

import type { RendererKind } from "shooosh"
import type { ExampleSpec } from "./types"

export type MountExampleOptions = {
  backend?: "auto" | "webgpu" | "webgl2"
  onBackend?: (kind: RendererKind | null) => void
  onError?: (error: unknown) => void
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

  const runOptions = {
    backend: options.backend ?? "auto",
    onInitError: options.onError,
  }

  if (spec.kind === "items") {
    const wrap = document.createElement("div")
    wrap.className = "cards"
    wrap.innerHTML = `<div class="card" data-card></div><div class="card" data-card></div>`
    stage.append(wrap)
    const handle = spec.run(wrap, runOptions)
    void handle.ready?.then((backend) => options.onBackend?.(backend ?? null))
    return () => handle.destroy()
  }

  if (spec.kind === "scroll-items") {
    stage.classList.add("scroll-demo")
    const wrap = document.createElement("div")
    wrap.className = "scroll-stack"
    wrap.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const label = ["Hero", "Feature", "Detail", "Quote", "Close"][i]
      return `<section class="scroll-block"><p class="scroll-label">${label}</p><div class="card scroll-card" data-card></div></section>`
    }).join("")
    stage.append(wrap)
    const handle = spec.run(wrap, runOptions)
    void handle.ready?.then((backend) => options.onBackend?.(backend ?? null))
    return () => {
      stage.classList.remove("scroll-demo")
      handle.destroy()
    }
  }

  if (spec.kind === "scroll-sections") {
    stage.classList.add("scroll-demo")
    const wrap = document.createElement("div")
    wrap.className = "scroll-stack scroll-stack--sections"
    wrap.innerHTML = ["Hero band", "Mid band", "Lower band", "Footer band"]
      .map(
        (label) =>
          `<section class="scroll-section" data-plane><p class="scroll-label">${label}</p></section>`,
      )
      .join("")
    stage.append(wrap)
    const handle = spec.run(wrap, runOptions)
    void handle.ready?.then((backend) => options.onBackend?.(backend ?? null))
    return () => {
      stage.classList.remove("scroll-demo")
      handle.destroy()
    }
  }

  if (spec.kind === "sdf-icons") {
    const wrap = document.createElement("div")
    wrap.className = "cards cards--icons"
    wrap.innerHTML =
      `<div class="card card--icon" data-icon></div>` +
      `<div class="card card--icon" data-icon></div>` +
      `<div class="card card--icon" data-icon></div>`
    stage.append(wrap)
    const handle = spec.run(wrap, runOptions)
    void handle.ready?.then((backend) => options.onBackend?.(backend ?? null))
    return () => handle.destroy()
  }

  if (spec.kind === "msdf-text") {
    const wrap = document.createElement("div")
    wrap.className = "msdf-stage"
    wrap.innerHTML = `<div class="msdf-box" data-msdf></div>`
    stage.append(wrap)
    const handle = spec.run(wrap, runOptions)
    void handle.ready?.then((backend) => options.onBackend?.(backend ?? null))
    return () => handle.destroy()
  }

  const canvas = document.createElement("canvas")
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  stage.append(canvas)

  const handle = spec.run(canvas, runOptions)
  void handle.ready?.then((backend) => options.onBackend?.(backend ?? null))
  return () => handle.destroy()
}
