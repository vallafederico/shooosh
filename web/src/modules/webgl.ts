import { createCanvasScene, createMouseMonad, createPostProcessor } from "shooosh"
import { createDomLayer, type DomLayer, type DomScan } from "shooosh/dom"
import { bulgeEffect, bulgeEffectWgsl, bulgePointerY } from "../bulge-post"
import vuvShader from "../vuv.wgsl"

const landingFonts = [
  { family: "Archivo", weight: 400, json: "/msdf/archivo.json", texture: "/msdf/archivo.png" },
  { family: "Archivo", weight: 700, json: "/msdf/archivo-bold.json", texture: "/msdf/archivo-bold.png" },
  { family: "Geist Mono", weight: 400, json: "/msdf/geist-mono.json", texture: "/msdf/geist-mono.png" },
]

function bindPiecewise(dom: DomLayer) {
  for (const plane of document.querySelectorAll<HTMLElement>("[data-sh-bind]")) {
    dom.bind(plane, { shaders: vuvShader })
  }
  for (const img of document.querySelectorAll<HTMLImageElement>("img[data-sh-media]")) {
    dom.media(img)
  }
  for (const box of document.querySelectorAll<HTMLElement>("[data-sh-box]")) {
    dom.box(box)
  }
  for (const text of document.querySelectorAll<HTMLElement>("[data-sh-text]")) {
    dom.text(text)
  }
}

export default function webgl(element: HTMLElement) {
  if (!(element instanceof HTMLCanvasElement)) return

  const pageMode = element.dataset.dom === "scan"
  const requestedBackend = new URLSearchParams(location.search).get("backend")
  const backend = requestedBackend === "webgl" ? "webgl2" : requestedBackend === "webgpu" || requestedBackend === "webgl2" ? requestedBackend : "auto"
  let disposed = false
  let native = new URLSearchParams(location.search).get("render") === "native"
  let layer: DomLayer | null = null
  let scan: DomScan | null = null
  let post: ReturnType<typeof createPostProcessor> | null = null
  const mouse = createMouseMonad({ resetOnLeave: false, easing: 0.18 })
  const scene = createCanvasScene(element, {
    backend,
    // Small mirrored UI needs extra samples, including through the bulge pass.
    dpr: { scale: 2 },
    clearColor: { r: 0, g: 0, b: 0, a: 0 },
    onInitError: (error) => console.error("[shooosh]", error),
  })

  function paintGpu() {
    if (!layer || native) return
    if (pageMode) {
      scan = layer.scan({ shaders: { bind: vuvShader } })
      return
    }
    bindPiecewise(layer)
  }

  function setMode(next: boolean) {
    const changed = native !== next
    native = next
    document.documentElement.classList.toggle("has-gpu", pageMode && !native && !disposed)
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-dom-toggle]")) {
      button.setAttribute("aria-pressed", String((button.dataset.domToggle === "native") === native))
    }
    if (!layer || !pageMode || !changed) return
    if (native) {
      scan?.destroy()
      scan = null
    } else {
      paintGpu()
    }
  }

  void scene.init().then(async () => {
    if (disposed) return
    const engine = scene.getEngine()
    if (!engine) return
    element.dataset.backend = engine.backend

    let effectId = ""
    let lastX = Infinity
    let lastY = Infinity
    post = createPostProcessor({
      onFrame(self) {
        const next = mouse.update()
        const x = next.x * 0.5 + 0.5
        const y = bulgePointerY(next.y, engine.backend)
        if (Math.abs(x - lastX) < 0.0005 && Math.abs(y - lastY) < 0.0005) return
        lastX = x
        lastY = y
        if (!effectId) return
        self.setEffectUni(effectId, { value1: x, value2: y, value3: 60 * element.width / Math.max(element.clientWidth, 1) })
      },
    })
    effectId = post.addFragmentEffect({
      fragmentShader: bulgeEffect,
      fragmentShaderWgsl: bulgeEffectWgsl,
      uni: { value1: -8, value2: -8, value3: 60 * element.width / Math.max(element.clientWidth, 1) },
    })

    const dom = await createDomLayer({
      engine,
      root: document.body,
      fonts: landingFonts,
      onError: ({ error }) => console.error("[shooosh]", error),
    })
    if (disposed) {
      post.destroy()
      post = null
      dom?.destroy()
      return
    }
    if (!dom) return
    layer = dom
    if (!native) paintGpu()
    setMode(native)
  })

  const onToggle = (event: Event) => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-dom-toggle]")
    if (!button) return
    setMode(button.dataset.domToggle === "native")
  }
  document.addEventListener("click", onToggle)

  return () => {
    disposed = true
    document.documentElement.classList.remove("has-gpu")
    document.removeEventListener("click", onToggle)
    mouse.destroy()
    post?.destroy()
    post = null
    scan?.destroy()
    scan = null
    layer?.destroy()
    layer = null
    scene.destroy()
  }
}
