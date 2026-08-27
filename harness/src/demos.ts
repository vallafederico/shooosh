import {
  acquireLayer,
  createItem,
  createScene,
  effects,
  releaseLayer,
  WebGLUnavailableError,
} from "shooosh"

export type Demo = {
  id: string
  label: string
  mount: (stage: HTMLElement) => () => void
}

const SCREEN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;

void main() {
  float t = uUni[0].x;
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float bands = sin(r * 14.0 - t * 1.6 + sin(a * 3.0 + t));
  vec3 ink = vec3(0.047, 0.047, 0.043);
  vec3 acid = vec3(0.847, 1.0, 0.243);
  vec3 paper = vec3(0.925, 0.906, 0.863);
  vec3 color = mix(ink, paper, 0.08 + 0.12 * r);
  color = mix(color, acid, smoothstep(0.2, 0.85, bands * 0.5 + 0.5) * (1.0 - r * 0.45));
  outColor = vec4(color, 1.0);
}
`

const ITEM_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec4 uUni[4];
out vec4 outColor;

void main() {
  float t = uUni[0].x;
  float n = sin((vUv.x + vUv.y) * 12.0 + t * 2.0);
  vec3 a = vec3(0.847, 1.0, 0.243);
  vec3 b = vec3(0.925, 0.906, 0.863);
  outColor = vec4(mix(a, b, n * 0.5 + 0.5), 1.0);
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
    error instanceof WebGLUnavailableError
      ? "WebGL2 is not available in this browser."
      : error instanceof Error
        ? error.message
        : "Failed to start the scene."
  stage.append(el)
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
      "Dedicated canvas, fullscreen fragment, engine-owned raf.",
    )

    try {
      const scene = createScene(canvas, {
        debug: true,
        screen: {
          shaders: { fragment: SCREEN_FRAG },
          onFrame(self, frame) {
            self.setUni({ value1: frame.now * 0.001 })
          },
        },
      })
      return () => scene.destroy()
    } catch (error) {
      fail(stage, error)
      return () => {}
    }
  },
}

const items: Demo = {
  id: "items",
  label: "createItem + layer",
  mount(stage) {
    const engine = acquireLayer()
    if (!engine) {
      fail(stage, new WebGLUnavailableError())
      return () => {}
    }

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

    const controllers = [...wrap.querySelectorAll<HTMLElement>("[data-card]")].map(
      (card, index) =>
        createItem(card, {
          shaders: { fragment: ITEM_FRAG },
          onFrame(self, frame) {
            self.setUni({ value1: frame.now * 0.001 + index })
          },
        }),
    )

    return () => {
      controllers.forEach((item) => item.destroy())
      releaseLayer()
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
      "Scene render target piped through the post stack.",
    )

    try {
      const scene = createScene(canvas, {
        post: [effects.bloom({ intensity: 0.7 }), effects.noise({ amount: 0.08 })],
        screen: {
          shaders: { fragment: SCREEN_FRAG },
          onFrame(self, frame) {
            self.setUni({ value1: frame.now * 0.001 })
          },
        },
      })
      return () => scene.destroy()
    } catch (error) {
      fail(stage, error)
      return () => {}
    }
  },
}

export const demos: Demo[] = [screen, items, post]
