/** Dev-only audit. Counts ALL explicit rect/style calls, including input helper.
 * CPU span covers registered render callbacks, not GPU work or compositor time.
 * Instrumentation is restored after every scenario and excluded from production.
 */
import { createEngine, getDefaultEngine } from "shooosh"
import { createDomLayer } from "shooosh/dom"
import { mountCanvasInput } from "../../examples/dom-canvas-input"
import shader from "../../examples/dom-integration.wgsl"

import { run as runFabric } from "../../examples/fabric-sheen"
import { run as runSss } from "../../examples/sss"
import { run as runSsao } from "../../examples/ssao"
import { run as runGlass } from "../../examples/refractive-glass"

const backend = new URLSearchParams(location.search).get("backend") === "webgl2" ? "webgl2" : "webgpu"
document.querySelector("#backend")!.textContent = backend
const fixture = document.querySelector<HTMLElement>("#fixture")!
const status = document.querySelector<HTMLElement>("#status")!
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const results: object[] = []
const source = document.createElement("canvas"); source.width = 48; source.height = 30
const paint = source.getContext("2d")!; paint.fillStyle = "#a83e27"; paint.fillRect(0, 0, 48, 30)
const sourceUrl = source.toDataURL()

import { run as runPile } from "../../examples/physics-pile"
import { run as runPendulum } from "../../examples/physics-pendulum"
import { run as runPhysics3D } from "../../examples/physics-3d"

const demoRuns = { fabric: runFabric, sss: runSss, ssao: runSsao, pile: runPile, pendulum: runPendulum, physics3d: runPhysics3D }
type Scenario = { name: string; physics?: "active" | "paused" | "sleeping"; demo?: keyof typeof demoRuns; change?: boolean; glass?: boolean; images?: number; repair?: number; hot?: boolean; input?: boolean; focus?: boolean }
const scenarios: Scenario[] = [
  ...(["pile", "pendulum", "physics3d"] as const).flatMap(demo =>
    (["active", "paused", "sleeping"] as const).map(physics => ({ name: `${demo} ${physics}`, demo, physics }))),
  { name: "engine idle" },
  { name: "glass idle", glass: true },
  { name: "Fabric / sheen idle · WIP", demo: "fabric" },
  { name: "SSS idle · WIP (WebGL2: fallback)", demo: "sss" },
  { name: "SSAO idle · WIP (WebGL2: fallback)", demo: "ssao" },
  { name: "20 images idle, repair=0", images: 20, repair: 0 },
  { name: "20 images idle, repair=500", images: 20, repair: 500 },
  { name: "CSSOM change repaired", images: 1, repair: 500, change: true },
  ...[1, 20, 100].map(images => ({ name: `${images} images, forced active`, images, repair: 0, hot: true })),
  { name: "images + input idle", images: 1, repair: 500, input: true },
  { name: "input CSSOM change repaired", input: true, change: true },
  { name: "input idle", input: true },
  { name: "input focused", input: true, focus: true },
]

async function runScenario(scenario: Scenario) {
  const canvas = document.createElement("canvas"), root = document.createElement("div")
  root.setAttribute("data-grid", ""); fixture.append(root, canvas)
  const initStarted = performance.now()
  const glass = scenario.glass ? runGlass(canvas, { backend }) : null
  const demo = scenario.demo ? demoRuns[scenario.demo](canvas, { backend }) : null
  if (demo) await demo.ready
  if (glass) await glass.ready
  const engine = await (demo ? Promise.resolve(demo.getEngine?.()!) : glass ? Promise.resolve(getDefaultEngine()!) : createEngine(canvas, { backend, dpr: { max: 2 } })).catch(error => {
    fixture.replaceChildren(); throw error
  })
  if (!engine) { demo?.destroy(); glass?.destroy(); fixture.replaceChildren(); throw new Error("Example did not initialize an engine") }
  const initializationMs = performance.now() - initStarted
  let impulseTimer: ReturnType<typeof setInterval> | undefined
  let visibilityInterrupted = document.hidden
  const visibility = () => { if (document.hidden) visibilityInterrupted = true }
  document.addEventListener("visibilitychange", visibility)
  const originalRect = Element.prototype.getBoundingClientRect, originalStyle = window.getComputedStyle
  let rects = 0, styles = 0, frameStart = 0, measuring = false, times: number[] = []
  Element.prototype.getBoundingClientRect = function () { if (measuring) rects++; return originalRect.call(this) }
  window.getComputedStyle = function (el, pseudo) { if (measuring) styles++; return originalStyle.call(window, el, pseudo) }
  const wakeEvents: Record<string, number> = {}
  const externalWake = (event: Event) => { if (measuring) wakeEvents[event.type] = (wakeEvents[event.type] ?? 0) + 1 }
  const eventNames = ["pointermove", "pointerdown", "resize", "scroll", "focusin", "focusout"]
  for (const name of eventNames) window.addEventListener(name, externalWake, true)
  let requests = 0
  const requestFrame = engine.requestFrame
  engine.requestFrame = () => { if (measuring) requests++; requestFrame() }
  const repairStyle = document.createElement("style")
  if (scenario.change) document.head.append(repairStyle)
  const begin = engine.onRender(() => { frameStart = performance.now() }, { layer: -Number.MAX_VALUE })
  let dom: Awaited<ReturnType<typeof createDomLayer>> = null
  let inputMirror: ReturnType<typeof mountCanvasInput> | null = null
  let end = () => {}
  try {
    if (scenario.images) {
      const imgs = Array.from({ length: scenario.images }, () => {
        const img = new Image(); img.alt = "Synthetic audit tile"; if (scenario.change) img.className = "audit-repair-probe"; img.src = sourceUrl; root.append(img); return img
      })
      dom = await createDomLayer({ engine, root, repairInterval: scenario.repair ?? 0 })
      imgs.forEach(img => dom!.media(img))
    }
    if (scenario.input) {
      root.removeAttribute("data-grid")
      const field = document.createElement("label"); field.className = scenario.change ? "field audit-repair-probe" : "field"
      const input = document.createElement("input"); input.value = "Synthetic audit input"; input.setAttribute("aria-label", "Audit input")
      field.append(input); root.append(field)
      inputMirror = mountCanvasInput(input, fixture, engine, shader, 0)
      if (scenario.focus) input.focus()
    }
    end = engine.onRender(() => {
      if (measuring) times.push(performance.now() - frameStart)
      if (scenario.hot) engine.requestFrame()
    }, { layer: Number.MAX_VALUE })
    engine.start()
    if (scenario.physics) {
      const control = (text: string) => Array.from(fixture.querySelectorAll("button")).find(button => button.textContent === text)
      if (scenario.physics === "paused") control("Pause")?.click()
      else {
        control("Play")?.click()
        if (scenario.physics === "active") {
          control("Apply impulse")?.click()
          impulseTimer = setInterval(() => control("Apply impulse")?.click(), 800)
        } else {
          const deadline = performance.now() + 60000
          while (!fixture.querySelector('[role="status"]')?.textContent?.startsWith("Sleeping")) {
            if (performance.now() > deadline) throw new Error("Physics did not reach sleep within 60 seconds")
            await delay(100)
          }
        }
      }
    }
    // Exclude first compilation, image decode, observer notifications and settle.
    await delay(1500)
    if (scenario.images && dom?.stats.active !== scenario.images) throw new Error("Not every image activated")
    if (scenario.input && root.querySelector(".field")?.getAttribute("data-canvas-input") !== "active") throw new Error("Input did not activate")
    measuring = true
    if (scenario.change) repairStyle.sheet!.insertRule(".audit-repair-probe { position: relative; left: 8px; }")
    const started = performance.now(); await delay(scenario.physics ? 2000 : 1000); const durationMs = performance.now() - started
    measuring = false
    if (scenario.demo && scenario.physics !== "active" && Object.keys(wakeEvents).length === 0 && times.length !== 0) throw new Error("Demo did not settle while idle")
    if (scenario.repair && !scenario.change && Object.keys(wakeEvents).length === 0 && requests !== 0) throw new Error("Unchanged repair scan requested rendering")
    if (scenario.change && requests === 0) throw new Error("Maintenance missed a CSSOM-only position change")
    if (visibilityInterrupted) throw new Error("Visibility interrupted: rerun with this tab visible")
    times.sort((a, b) => a - b)
    const percentile = (p: number) => times.length ? Number(times[Math.min(times.length - 1, Math.floor(times.length * p))]!.toFixed(3)) : null
    return { scenario: scenario.name, initializationMs: Number(initializationMs.toFixed(2)), backend: engine.backend, durationMs: Math.round(durationMs), frames: times.length, rectReads: rects, styleReads: styles,
      requests, wakeEvents, callbackCpuP50Ms: percentile(.5), callbackCpuP95Ms: percentile(.95), documentHidden: document.hidden, visibilityInterrupted }
  } finally {
    if (impulseTimer) clearInterval(impulseTimer)
    measuring = false; Element.prototype.getBoundingClientRect = originalRect; window.getComputedStyle = originalStyle
    document.removeEventListener("visibilitychange", visibility)
    engine.requestFrame = requestFrame
    for (const name of eventNames) window.removeEventListener(name, externalWake, true)
    repairStyle.remove()
    begin(); end(); demo?.destroy(); glass?.destroy(); inputMirror?.destroy(); dom?.destroy(); if (!glass && !demo) engine.destroy(); fixture.replaceChildren()
  }
}

document.querySelector<HTMLButtonElement>("#run")!.addEventListener("click", async event => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true
  results.length = 0; document.querySelector("#results")!.replaceChildren()
  try {
    const selected = new URLSearchParams(location.search).get("scenario")
    for (const scenario of scenarios.filter(value => !selected || selected === "physics" && !!value.physics || selected === "baseline" && !value.physics || selected === "wip" && !!value.demo && !value.physics || value.name === selected)) {
      status.textContent = `Running: ${scenario.name}`
      const result = await runScenario(scenario); results.push(result)
      const row = document.createElement("tr")
      for (const value of [result.scenario, result.frames, result.rectReads, result.styleReads, `${result.callbackCpuP50Ms ?? "—"} / ${result.callbackCpuP95Ms ?? "—"}`]) {
        const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell)
      }
      document.querySelector("#results")!.append(row)
    }
    status.textContent = "Complete. Timings are instrumented callback spans, not total frame or GPU time."
  } catch (error) { status.textContent = `Failed: ${String(error)}` }
  finally {
    document.querySelector("#report")!.textContent = JSON.stringify({ capturedAt: new Date().toISOString(), userAgent: navigator.userAgent,
      scriptResources: performance.getEntriesByType("resource").filter(entry => entry.name.includes(".js")).map(entry => {
        const resource = entry as PerformanceResourceTiming
        return { url: resource.name, transferSize: resource.transferSize, encodedBodySize: resource.encodedBodySize, durationMs: Number(resource.duration.toFixed(2)) }
      }),
      dpr: devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, results }, null, 2)
    button.disabled = false
  }
})
