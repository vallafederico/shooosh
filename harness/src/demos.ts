import {
  acquireLayer,
  createItem,
  createScene,
  effects,
  GpuUnavailableError,
  releaseLayer,
  WebGLUnavailableError,
} from "shooosh"
import { readBackendParam, setBackendLabel } from "./backend"

export type Demo = {
  id: string
  label: string
  mount: (stage: HTMLElement) => () => void
}

const backend = readBackendParam()

const SCREEN_FRAG = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let r = length(p);
  let a = atan2(p.y, p.x);
  let bands = sin(r * 14.0 - t * 1.6 + sin(a * 3.0 + t));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.08 + 0.12 * r);
  color = mix(color, acid, smoothstep(0.2, 0.85, bands * 0.5 + 0.5) * (1.0 - r * 0.45));
  return vec4f(color, 1.0);
}
`

const ITEM_FRAG = `fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let n = sin((vUv.x + vUv.y) * 12.0 + t * 2.0);
  let a = vec3f(0.847, 1.0, 0.243);
  let b = vec3f(0.925, 0.906, 0.863);
  return vec4f(mix(a, b, n * 0.5 + 0.5), 1.0);
}
`

function caption(stage: HTMLElement, title: string, copy: string) {
  const overlay = document.createElement("div")
  overlay.className = "overlay"
  overlay.innerHTML = `<h1>${title}</h1><p>${copy}</p>`
  stage.append(overlay)
}

function fail(stage: HTMLElement, error: unknown) {
  const el = document.createElement("p")
  el.className = "fallback"
  el.textContent =
    error instanceof GpuUnavailableError || error instanceof WebGLUnavailableError
      ? "No GPU backend is available in this browser."
      : error instanceof Error
        ? error.message
        : "Failed to start the scene."
  stage.append(el)
  setBackendLabel(null)
}

const screen: Demo = {
  id: "screen",
  label: "createScene",
  mount(stage) {
    const canvas = document.createElement("canvas")
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    stage.append(canvas)
    caption(
      stage,
      "createScene",
      "Dedicated canvas, fullscreen WGSL fragment. WebGPU when the probe allows, WebGL2 otherwise.",
    )

    const scene = createScene(canvas, {
      debug: true,
      backend,
      onInitError: (error) => fail(stage, error),
      screen: {
        shaders: { fragment: SCREEN_FRAG },
        onFrame(self, frame) {
          self.setUni({ value1: frame.now * 0.001 })
        },
      },
    })
    void scene.getInitPromise()?.then(() => {
      setBackendLabel(scene.getEngine()?.backend ?? null)
    })
    return () => scene.destroy()
  },
}

const items: Demo = {
  id: "items",
  label: "createItem + layer",
  mount(stage) {
    let released = false
    let acquired = false
    const controllers: ReturnType<typeof createItem>[] = []

    const wrap = document.createElement("div")
    wrap.className = "cards"
    wrap.innerHTML = `
      <div class="card" data-card></div>
      <div class="card" data-card></div>
    `
    stage.append(wrap)
    caption(
      stage,
      "acquireLayer + createItem",
      "Shared page-behind canvas. Items track the card rects.",
    )

    void acquireLayer({ backend }).then((engine) => {
      if (released) {
        if (engine) releaseLayer()
        return
      }
      if (!engine) {
        fail(stage, new GpuUnavailableError())
        return
      }
      acquired = true
      setBackendLabel(engine.backend)
      for (const [index, card] of [
        ...wrap.querySelectorAll<HTMLElement>("[data-card]"),
      ].entries()) {
        controllers.push(
          createItem(card, {
            shaders: { fragment: ITEM_FRAG },
            onFrame(self, frame) {
              self.setUni({ value1: frame.now * 0.001 + index })
            },
          }),
        )
      }
    })

    return () => {
      released = true
      controllers.forEach((item) => item.destroy())
      if (acquired) releaseLayer()
    }
  },
}

const post: Demo = {
  id: "post",
  label: "post effects",
  mount(stage) {
    const canvas = document.createElement("canvas")
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    stage.append(canvas)
    caption(
      stage,
      "effects.bloom + noise",
      "WebGL2: scene target through the post stack. WebGPU: post is skipped (screen still runs).",
    )

    const scene = createScene(canvas, {
      backend,
      onInitError: (error) => fail(stage, error),
      post: [effects.bloom({ intensity: 0.7 }), effects.noise({ amount: 0.08 })],
      screen: {
        shaders: { fragment: SCREEN_FRAG },
        onFrame(self, frame) {
          self.setUni({ value1: frame.now * 0.001 })
        },
      },
    })
    void scene.getInitPromise()?.then(() => {
      setBackendLabel(scene.getEngine()?.backend ?? null)
    })
    return () => scene.destroy()
  },
}

export const demos: Demo[] = [screen, items, post]
