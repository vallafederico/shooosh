/**
 * Item maps on both backends (`?backend=webgl2` for the fallback). Two items
 * sample a red image and a declared `uDepth` map (a left→right ramp) with the
 * same fragment: A gets its map at once, B a second later through `setMap`
 * (an empty slot samples transparent black, so B starts dark and fills in).
 * Expected: both show a red ramp, dark at the left, bright at the right.
 */
import { createScene, createItem, loadTexture } from "shooosh"
import { compileShader } from "shooosh/compiler"

const backend = new URLSearchParams(location.search).get("backend") === "webgl2" ? "webgl2" : "auto"
const report = document.querySelector("#report")!
const log = (data: unknown) => { report.textContent = JSON.stringify(data, null, 2) }

const shader = compileShader(`fn fsMain() -> vec4f {
  let st = fitUv(vUv);
  let image = textureSample(uTexture, uSampler, st);
  let depth = textureSample(uDepth, uSampler, st).r;
  return vec4f(image.rgb * (0.15 + 0.85 * depth), 1.0);
}`)

function canvasOf(paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas")
  c.width = 256; c.height = 256
  paint(c.getContext("2d")!)
  return c
}

try {
  const scene = createScene(document.querySelector<HTMLCanvasElement>("#gl")!, { backend, clearColor: { r: 0, g: 0, b: 0, a: 0 } })
  await scene.init?.()
  const image = await loadTexture(canvasOf((ctx) => { ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 256, 256) }))
  const depth = await loadTexture(canvasOf((ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0)
    g.addColorStop(0, "#000"); g.addColorStop(1, "#fff")
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256)
  }))
  if (new URLSearchParams(location.search).has("plain")) {
    // No maps on the page: a textured item with the default look, to compare against.
    const plain = createItem(document.querySelector<HTMLElement>("#a")!, { texture: image })
    log({ backend: scene.getEngine()?.backend, plain: true })
    window.addEventListener("pagehide", () => { plain.destroy(); scene.destroy() }, { once: true })
    throw null
  }
  const a = createItem(document.querySelector<HTMLElement>("#a")!, { shaders: shader, texture: image, maps: { uDepth: depth } })
  const b = createItem(document.querySelector<HTMLElement>("#b")!, { shaders: shader, texture: image, maps: { uDepth: null } })
  log({ backend: scene.getEngine()?.backend, b: "empty slot" })
  setTimeout(() => {
    b.setMap("uDepth", depth)
    log({ backend: scene.getEngine()?.backend, b: "map set" })
  }, 1000)
  window.addEventListener("pagehide", () => { a.destroy(); b.destroy(); scene.destroy() }, { once: true })
} catch (error) {
  if (error !== null) log({ error: String(error) })
}
