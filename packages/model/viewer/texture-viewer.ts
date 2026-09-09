import { createCanvasScene, createScreen, loadTexture } from "shooosh"
import shader from "../src/texture-preview"
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const select = (id: string) => $<HTMLSelectElement>(id)
const number = (id: string) => Number($<HTMLInputElement>(id).value)
let scene: ReturnType<typeof createCanvasScene> | undefined
let screen: ReturnType<typeof createScreen> | undefined
let generation = 0,
  pan = [0, 0]
let items: any[] = []
function update() {
  screen?.setUni({
    value9: number("mode"),
    value10: number("wipe"),
    value11: number("zoom"),
    value12: number("channel"),
    value13: pan[0],
    value14: pan[1],
  })
}
async function mount() {
  const current = ++generation
  scene?.destroy()
  scene = undefined
  screen = undefined
  const old = document.querySelector("canvas")!,
    canvas = old.cloneNode() as HTMLCanvasElement
  old.replaceWith(canvas)
  canvas.tabIndex = 0
  const item = items[Number(select("asset").value)]
  $("error").hidden = true
  $("report").textContent = JSON.stringify(item?.report ?? item?.error, null, 2)
  $("stats").replaceChildren()
  if (!item?.atlas) {
    $("error").textContent = item?.error ?? "No textures found"
    $("error").hidden = false
    $("status").textContent = "Preview unavailable"
    return
  }
  const r = item.report
  const bytes = (n: number) => `${(n / 1024).toFixed(1)} KB`
  for (const [label, value] of [
    [
      "Original",
      `${r.original.width} × ${r.original.height} · ${bytes(r.original.bytes)}`,
    ],
    [
      "Converted",
      `${r.converted.width} × ${r.converted.height} · ${bytes(r.converted.bytes)}`,
    ],
    [
      "File size change",
      `${Math.abs((1 - r.converted.bytes / r.original.bytes) * 100).toFixed(1)}% ${r.converted.bytes <= r.original.bytes ? "smaller" : "larger"}`,
    ],
    [
      "RGBA error / mip levels",
      `${r.comparison.rmse.toFixed(2)} / ${r.converted.levels}`,
    ],
  ]) {
    const cell = document.createElement("div")
    cell.className = "metric"
    const small = document.createElement("small"),
      strong = document.createElement("strong")
    small.textContent = label
    strong.textContent = value
    cell.append(small, strong)
    $("stats").append(cell)
  }
  $("status").textContent = "Loading decoded texture…"
  const next = createCanvasScene(canvas, {
    autoInit: false,
    backend: select("backend").value as "auto" | "webgpu" | "webgl2",
    dpr: { max: 2 },
  })
  scene = next
  try {
    await next.init()
    if (current !== generation) {
      next.destroy()
      return
    }
    const texture = await loadTexture(item.atlas, {
      engine: next.getEngine()!,
      flipY: false,
    })
    if (current !== generation) {
      texture.destroy()
      next.destroy()
      return
    }
    next.retain(texture)
    screen = next.retain(
      createScreen({
        shaders: shader,
        texture,
        textureFit: "stretch",
        onFrame(self, frame) {
          self.setUni({
            value15: frame.canvas.width / Math.max(1, frame.canvas.height),
            value16: r.comparison.width / r.comparison.height,
          })
        },
      }),
    )
    update()
    $("status").textContent = `${next.getEngine()?.backend ?? "GPU"} · decoded comparison`
  } catch (error) {
    if (current !== generation) return
    next.destroy()
    $("error").textContent = String(error)
    $("error").hidden = false
    $("status").textContent = "Preview failed"
  }
  let previous: [number, number] | undefined
  canvas.onpointerdown = (event) => {
    previous = [event.clientX, event.clientY]
    canvas.setPointerCapture(event.pointerId)
  }
  canvas.onpointermove = (event) => {
    if (!previous) return
    pan[0] -= (event.clientX - previous[0]) / canvas.clientWidth / number("zoom")
    pan[1] -= (event.clientY - previous[1]) / canvas.clientHeight / number("zoom")
    previous = [event.clientX, event.clientY]
    update()
  }
  canvas.onpointerup = canvas.onpointercancel = () => {
    previous = undefined
  }
  canvas.onkeydown = (event) => {
    const moves: Record<string, number[]> = {
      ArrowLeft: [-0.02, 0],
      ArrowRight: [0.02, 0],
      ArrowUp: [0, -0.02],
      ArrowDown: [0, 0.02],
    }
    if (moves[event.key]) {
      event.preventDefault()
      pan = pan.map((n, i) => n + moves[event.key][i] / number("zoom"))
      update()
    }
  }
}
for (const id of ["mode", "wipe", "zoom", "channel"]) $(id).oninput = update
$("reset").onclick = () => {
  pan = [0, 0]
  $<HTMLInputElement>("zoom").value = "1"
  $<HTMLInputElement>("wipe").value = "0.5"
  update()
}
for (const id of ["asset", "backend"])
  $(id).onchange = () => {
    void mount()
  }
fetch("comparison.json")
  .then((response) => {
    if (!response.ok) throw new Error("Comparison unavailable")
    return response.json()
  })
  .then((data) => {
    items = data.items
    items.forEach((item, i) => {
      const option = document.createElement("option")
      option.value = String(i)
      option.textContent = item.name
      select("asset").append(option)
    })
    return mount()
  })
  .catch((error) => {
    $("status").textContent = String(error)
  })
window.addEventListener("pagehide", () => {
  generation++
  scene?.destroy()
})
