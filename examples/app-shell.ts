/**
 * App-shell canvas — aiuis `Canvas`. One GPU surface for the whole layout.
 *
 * When: Solid / React / Astro layout owns a fixed inset-0 -z-10 canvas.
 * SSR: autoInit false, then await init() after hydrate.
 * After init, createItem / createParticles / post are safe.
 *
 * Canvas CSS we always use:
 *   position: fixed; inset: 0; width: 100%; height: 100%;
 *   pointer-events: none; z-index: -1; aria-hidden="true"
 *
 * Keep the Scene handle outside the canvas component so HMR does not remount
 * the engine. createItem may be called before init — it queues.
 *
 * Docs: docs/site-patterns.md · skill shooosh-site · skill shooosh-item
 */

import { createItem, createScene } from "shooosh"

const screenFrag = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  return vec4f(vec3f(0.05 + 0.02 * sin(t)), 1.0)
}
`

const itemFrag = `
fn fsMain() -> vec4f {
  let t = uUni.values0.x
  let key = vec3f(uUni.values1.x, uUni.values1.y, uUni.values1.z)
  return vec4f(mix(key, vec3f(vUv, 0.4), 0.35 + 0.15 * sin(t)), 1.0)
}
`

function readCssColor(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const m = raw.match(/[\d.]+/g)
  if (!m || m.length < 3) return [0.85, 1, 0.24]
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255]
}

export async function mount(
  canvas: HTMLCanvasElement,
  cards: HTMLElement[],
) {
  const scene = createScene(canvas, {
    autoInit: false,
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: (error) => console.error("[shooosh]", error),
    screen: {
      shaders: { fragment: screenFrag },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 })
      },
    },
  })
  await scene.init()

  const [r, g, b] = readCssColor("--color-key")
  const items = cards.map((el, index) =>
    createItem(el, {
      shaders: { fragment: itemFrag },
      uni: { value4: r, value5: g, value6: b },
      onFrame(self, frame) {
        self.setUni({ value1: frame.now * 0.001 + index })
      },
    }),
  )

  return () => {
    items.forEach((item) => item.destroy())
    scene.destroy()
  }
}
