import { createCanvasScene, createObject, loadTexture } from "shooosh"
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
const requestedBackend = params.get("backend")
if (requestedBackend && ["auto", "webgpu", "webgl2"].includes(requestedBackend)) {
  element<HTMLSelectElement>("backend").value = requestedBackend
}
const embedded = params.get("embedded") === "1"
if (embedded) {
  element<HTMLSelectElement>("backend").disabled = true
  element<HTMLSelectElement>("backend").title = "Use the gallery's renderer controls"
}
function reportBackend(backend: "webgpu" | "webgl2" | null) {
  if (embedded) window.parent.postMessage({ type: "car-pbr-ready", backend }, location.origin)
}
let scene: ReturnType<typeof createCanvasScene> | undefined
let object: ReturnType<typeof createObject> | undefined
let texture: Awaited<ReturnType<typeof loadTexture>> | undefined
let generation = 0,
  rotationX = 0.16,
  rotationY = 0.48,
  scale = 2.5,
  raf = 0,
  last = 0
let dragging: [number, number] | undefined
let vertices: Float32Array, indices: Uint32Array, shader: any, metadata: any
const value = (id: string) => Number(element<HTMLInputElement>(id).value)
function update() {
  object?.setTransform({ rotationX, rotationY, scale })
  object?.setUni({
    value1: rotationX,
    value2: rotationY,
    value3: value("exposure"),
    value4: value("emission"),
    value5: element<HTMLInputElement>("normals").checked ? 1 : 0,
    value6: value("roughness"),
    value7: value("reflections"),
  })
}
function animate(now: number) {
  if (!element<HTMLInputElement>("rotate").checked) return
  if (last && !dragging) rotationY += Math.min(now - last, 40) * 0.0002
  last = now
  update()
  raf = requestAnimationFrame(animate)
}
async function mount() {
  const id = ++generation
  const canvas = document.querySelector("canvas")!.cloneNode() as HTMLCanvasElement
  document.querySelector("canvas")!.replaceWith(canvas)
  object = undefined
  scene?.destroy()
  texture = undefined
  element("status").textContent = "Preparing material…"
  element("error").hidden = true
  const selected = element<HTMLSelectElement>("variant").value
  const variant = metadata.variants.find((v: any) => v.name === selected)
  element("bytes").textContent = `${(variant.sourceBytes / 1048576).toFixed(2)} MB`
  element("format").textContent =
    selected === "original"
      ? "Original PNG"
      : selected === "webp"
        ? "WebP / lossless data maps"
        : "KTX2 · UASTC"
  const next = createCanvasScene(canvas, {
    autoInit: false,
    backend: element<HTMLSelectElement>("backend").value as "auto" | "webgpu" | "webgl2",
    dpr: { max: 1.5 },
    clearColor: { r: 0.025, g: 0.035, b: 0.045, a: 0 },
  })
  scene = next
  try {
    await next.init()
    if (id !== generation) {
      next.destroy()
      return
    }
    const loaded = await loadTexture(selected + ".png", {
      engine: next.getEngine()!,
      flipY: false,
      sampler: { minFilter: "linear", magFilter: "linear" },
    })
    if (id !== generation) {
      loaded.destroy()
      next.destroy()
      return
    }
    texture = loaded
    next.retain(loaded)
    object = next.retain(
      createObject(null, {
        shape: { type: "custom", vertices, indices, vertexStride: 8 },
        placement: { centerX: 0, centerY: 0, scale: 1 },
        camera: { enabled: true, distance: 3.5, fov: 40, near: 0.1, far: 100 },
        envMap: loaded.texture,
        shaders: shader,
      }),
    )
    update()
    element("status").textContent =
      `${next.getEngine()?.backend} · ${metadata.triangles.toLocaleString()} triangles`
    reportBackend(next.getEngine()?.backend ?? null)
  } catch (error) {
    if (id !== generation) return
    next.destroy()
    element("error").hidden = false
    element("error").textContent = String(error)
    element("status").textContent = "Material preview unavailable"
    reportBackend(null)
  }
  canvas.onpointerdown = (e) => {
    dragging = [e.clientX, e.clientY]
    canvas.setPointerCapture(e.pointerId)
  }
  canvas.onpointermove = (e) => {
    if (!dragging) return
    rotationY += (e.clientX - dragging[0]) * 0.008
    rotationX = Math.max(
      -1.3,
      Math.min(1.3, rotationX + (e.clientY - dragging[1]) * 0.008),
    )
    dragging = [e.clientX, e.clientY]
    update()
  }
  canvas.onpointerup = canvas.onpointercancel = () => {
    dragging = undefined
  }
  canvas.onwheel = (e) => {
    e.preventDefault()
    scale = Math.max(0.7, Math.min(3.3, scale * Math.exp(-e.deltaY * 0.001)))
    update()
  }
  canvas.tabIndex = 0
  canvas.onkeydown = (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault()
      rotationY += e.key === "ArrowLeft" ? -0.12 : e.key === "ArrowRight" ? 0.12 : 0
      rotationX += e.key === "ArrowUp" ? -0.12 : e.key === "ArrowDown" ? 0.12 : 0
      update()
    }
  }
}
for (const id of ["exposure", "roughness", "reflections", "emission", "normals"])
  element(id).oninput = update
for (const id of ["variant", "backend"]) element(id).onchange = () => void mount()
element("reset").onclick = () => {
  rotationX = 0.16
  rotationY = 0.48
  scale = 2.5
  update()
}
element("rotate").onchange = () => {
  cancelAnimationFrame(raf)
  last = 0
  if (element<HTMLInputElement>("rotate").checked) raf = requestAnimationFrame(animate)
}
window.addEventListener("pagehide", () => {
  generation++
  cancelAnimationFrame(raf)
  scene?.destroy()
})
async function json(path: string) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`)
  return r.json()
}
async function bytes(path: string) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`)
  return r.arrayBuffer()
}
Promise.all([
  json("model.json"),
  json("shader.json"),
  bytes("vertices.bin"),
  bytes("indices.bin"),
])
  .then(async ([m, s, v, i]) => {
    metadata = m
    shader = s
    vertices = new Float32Array(v)
    indices = new Uint32Array(i)
    await mount()
  })
  .catch((e) => {
    reportBackend(null)
    element("error").hidden = false
    element("error").textContent = String(e)
  })
