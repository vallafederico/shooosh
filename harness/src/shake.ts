/** Smoke-test actual emitted ESM, not the harness's shooosh source alias. */
// @ts-expect-error The emitted JS uses esm.js; its declarations use index.d.ts.
import { createScene as builtCreateScene } from "../../dist/esm.js"
// @ts-expect-error The emitted JS uses esm.js; its declarations use index.d.ts.
import { createDomLayer as builtCreateDomLayer } from "../../dist/dom/esm.js"
const createScene: typeof import("../../package/index").createScene = builtCreateScene
const createDomLayer: typeof import("../../package/dom/index").createDomLayer = builtCreateDomLayer
const backend = new URLSearchParams(location.search).get("backend") === "webgl2" ? "webgl2" : "webgpu"
const status = document.querySelector<HTMLElement>("#status")!
const source = document.createElement("canvas"); source.width = 360; source.height = 140
const ctx = source.getContext("2d")!; ctx.fillStyle = "#df6138"; ctx.fillRect(0, 0, 360, 140)
ctx.fillStyle = "#fff1bc"; ctx.beginPath(); ctx.arc(180, 70, 50, 0, Math.PI * 2); ctx.fill()
document.querySelector<HTMLImageElement>("#image")!.src = source.toDataURL()
const scene = createScene(document.querySelector<HTMLCanvasElement>("#scene")!, { backend,
  screen: { shaders: { fragment: "fn fsMain() -> vec4f { return vec4f(vUv.x, vUv.y, 0.7 * uUni.values0.x, 1.0); }" } } })
let dom: Awaited<ReturnType<typeof createDomLayer>> = null
async function run() {
try {
  await scene.getInitPromise()
  dom = await createDomLayer({ canvas: document.querySelector<HTMLCanvasElement>("#overlay")!, root: document.querySelector<HTMLElement>("#gallery")!, backend, repairInterval: 0 })
  if (!dom) throw new Error("DOM engine unavailable")
  const binding = dom.media(document.querySelector<HTMLImageElement>("#image")!)
  const result = await binding.ready
  if (result.state !== "active") throw new Error(`DOM binding: ${result.state}`)
  status.textContent = `PASS · scene ${scene.getEngine()?.backend} · DOM ${dom.engine.backend} active · built ESM`
} catch (error) { status.textContent = `FAIL · ${String(error)}` }
}
void run()
const cleanup = () => { dom?.destroy(); scene.destroy() }
window.addEventListener("pagehide", cleanup, { once: true })
if (import.meta.hot) import.meta.hot.dispose(cleanup)
