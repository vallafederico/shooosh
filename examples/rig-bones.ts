/** Optional shooosh/rig example: bones, explicit-time sampling and an attached socket.
 * Copy with rig-fixture.ts, physics-lab.wgsl, types.ts and shaders.d.ts. See rig-bones.md.
 */
import { createCanvasScene, createObject } from "shooosh"
import {
  createRig,
  createRigAnimator,
  getSocketMatrix,
  type RigDefinition,
} from "shooosh/rig"
import { poseToTransform, rotateVector3 } from "shooosh/utils"
import shader, { fragment } from "./physics-lab.wgsl"
import { demoRig } from "./rig-fixture"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"
export { fragment }

// A tapered bone points along +Y; scale/rotation can follow any parent-to-child span.
function boneShape() {
  const points = [
    [0, -0.5, 0],
    [0, 0.5, 0],
    [-0.035, -0.25, 0],
    [0, -0.25, 0.035],
    [0.035, -0.25, 0],
    [0, -0.25, -0.035],
  ]
  const faces = [
    [0, 3, 2],
    [0, 4, 3],
    [0, 5, 4],
    [0, 2, 5],
    [1, 2, 3],
    [1, 3, 4],
    [1, 4, 5],
    [1, 5, 2],
  ]
  const vertices: number[] = []
  for (const [a, b, c] of faces) {
    const u = points[b].map((v, i) => v - points[a][i]),
      v = points[c].map((v, i) => v - points[a][i])
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]
    const length = Math.hypot(...normal)
    for (const index of [a, b, c])
      vertices.push(...points[index], ...normal.map((n) => n / length))
  }
  return {
    type: "custom" as const,
    vertices: new Float32Array(vertices),
    indices: Uint16Array.from({ length: vertices.length / 6 }, (_, i) => i),
    vertexStride: 6 as const,
  }
}
export function run(host: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  const root = document.createElement("section")
  root.style.cssText =
    "position:relative;width:100%;height:100%;min-height:640px;display:grid;grid-template-rows:auto minmax(320px,1fr) auto;background:#101719;color:#e4e9de;font:13px system-ui"
  root.innerHTML = `<div style="padding:22px;display:flex;gap:12px;flex-wrap:wrap;align-items:center"><div style="margin-right:auto"><h1 style="margin:0 0 6px;font-size:22px">Rig · bones & sockets</h1><span>Sample a pose. Select a bone. Move its attached marker.</span></div><button data-demo>Built-in arm</button><button data-car>Load car rig</button><label>Open .rig.json <input data-file type="file" accept=".json" style="max-width:190px"></label></div><div style="position:relative;min-height:0"><canvas aria-label="Animated bone hierarchy" style="width:100%;height:100%;display:block"></canvas><div data-info style="position:absolute;top:15px;left:22px;pointer-events:none;line-height:1.6"></div></div><div style="padding:20px;display:flex;gap:15px;flex-wrap:wrap;align-items:center"><button data-play disabled>Play</button><button data-rest disabled>Rest pose</button><label>Clip <select data-clip></select></label><label>Time <input data-time type="range" min="0" max="2" step="0.01" value="0"></label><output data-time-label>0.00s</output><label>Bone <select data-bone></select></label><label>Socket offset <input data-offset type="range" min="0" max="0.6" step="0.01" value="0.25"></label><label>Orbit <input data-yaw type="range" min="-3.14" max="3.14" step="0.01" value="0.35"></label><p data-error role="alert" style="flex-basis:100%;margin:0;color:#ffb397"></p></div>`
  host.append(root)
  const $ = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-${name}]`)!
  const select = (name: string) => $<HTMLSelectElement>(name),
    input = (name: string) => $<HTMLInputElement>(name)
  const canvas = root.querySelector("canvas")!
  for (const el of root.querySelectorAll<HTMLElement>("button,select,input"))
    el.style.cssText += ";font:inherit;accent-color:#d4f676"
  for (const el of root.querySelectorAll<HTMLElement>("button,select"))
    el.style.cssText +=
      ";padding:7px 10px;border:1px solid #42534e;border-radius:7px;color:#e4e9de;background:#1b292a"
  for (const name of ["demo", "car", "file"]) $<HTMLButtonElement>(name).disabled = true
  const scene = createCanvasScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.04, g: 0.065, b: 0.072, a: 1 },
  })
  const abort = new AbortController()
  let disposed = false,
    visible = true,
    playing = false,
    dirty = true,
    time = 0,
    last: number | undefined,
    generation = 0
  let rig: ReturnType<typeof createRig>, animator: ReturnType<typeof createRigAnimator>
  let visuals: {
    id: number
    joint: ReturnType<typeof createObject>
    link?: ReturnType<typeof createObject>
  }[] = []
  let socket: ReturnType<typeof createObject> | undefined,
    unsubscribe: (() => void) | undefined
  let center = [0, 0, 0],
    fit = 1
  const camera = { distance: 6, fov: 45, far: 100 },
    placement = { centerX: 0, centerY: 0, scale: 1 }
  const clear = () => {
    for (const v of visuals) {
      v.joint.destroy()
      v.link?.destroy()
    }
    visuals = []
    socket?.destroy()
    socket = undefined
  }
  const wake = () => {
    dirty = true
    last = undefined
    scene.getEngine()?.requestFrame()
  }
  const pause = () => {
    playing = false
    $("play").textContent = "Play"
    wake()
  }
  function mount(data: RigDefinition, label: string, car = false) {
    if (disposed) return
    if (!Array.isArray(data.nodes) || data.nodes.length > 256)
      throw new Error("This example is limited to 256 nodes.")
    const next = createRig(data),
      nextAnimator = createRigAnimator(next, data.clips ?? [])
    if (!next.bones.length) throw new Error("The file has no bones.")
    // Validate before replacing the last good rig. All GPU resources belong to this mount.
    next.update()
    clear()
    rig = next
    animator = nextAnimator
    pause()
    time = 0
    const points = rig.bones.map((b) => Array.from(b.worldMatrix()).slice(12, 15))
    const min = [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
      max = [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])))
    center = min.map((v, i) => (v + max[i]) / 2)
    fit = 3 / Math.max(0.1, ...max.map((v, i) => v - min[i]))
    select("bone").replaceChildren(
      ...rig.bones.map((b) => new Option(`${b.name || b.key} · #${b.id}`, String(b.id))),
    )
    select("bone").value = String(
      rig.bones.find((b) => b.key === "hand")?.id ?? rig.bones[rig.bones.length - 1].id,
    )
    select("clip").replaceChildren(
      ...animator.clips.map((c) => new Option(c.name || c.key, String(c.id))),
    )
    select("clip").disabled = !animator.clips.length
    $<HTMLButtonElement>("rest").disabled = false
    $<HTMLButtonElement>("play").disabled = !animator.clips.length
    input("time").disabled = !animator.clips.length
    input("time").max = String(animator.clips[0]?.duration ?? 0)
    const make = (
      shape: NonNullable<Parameters<typeof createObject>[1]>["shape"],
      color: number,
    ) =>
      createObject(null, {
        shape,
        placement,
        camera,
        shaders: shader,
        frustumCulling: false,
        uni: { value1: color },
      })
    for (const b of rig.bones)
      visuals.push({
        id: b.id,
        joint: make(
          {
            type: "roundedBox",
            width: 0.055,
            height: 0.055,
            depth: 0.055,
            rounding: 0.015,
          },
          1,
        ),
        ...(b.parent !== null ? { link: make(boneShape(), 0.7) } : {}),
      })
    socket = make(
      { type: "roundedBox", width: 0.16, height: 0.16, depth: 0.16, rounding: 0.025 },
      0,
    )
    $("info").replaceChildren()
    const title = document.createElement("div")
    title.textContent = `${label} · ${rig.bones.length} bones · ${animator.clips.length} clips`
    $("info").append(title)
    const note = document.createElement("div")
    note.textContent =
      "Blue: bones · lime: selected bone + socket. Skeleton view; mesh deformation is not shown."
    $("info").append(note)
    if (car) {
      const credit = document.createElement("a")
      credit.textContent = "Car by cuadot"
      credit.href = "https://sketchfab.com/cuadot"
      credit.style.cssText = "color:#d4f676;pointer-events:auto"
      $("info").append(credit)
    }
    $("error").textContent = (data.warnings ?? []).join(" ")
    wake()
  }
  const attempt = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      $("error").textContent = String(e)
      pause()
    }
  }
  async function load(car: boolean, file?: File) {
    const token = ++generation
    try {
      if (file && file.size > 8 * 1024 * 1024)
        throw new Error("Rig JSON must be under 8 MiB.")
      const response = file
        ? null
        : await fetch(new URL("./rig/car.rig.json", document.baseURI), {
            signal: abort.signal,
          })
      if (
        response &&
        (!response.ok ||
          !response.headers.get("content-type")?.includes("application/json"))
      )
        throw new Error("Prepare the car rig first; see examples/rig-bones.md.")
      const text = file ? await file.text() : await response!.text()
      if (text.length > 8 * 1024 * 1024) throw new Error("Rig JSON must be under 8 MiB.")
      const data = JSON.parse(text)
      if (!disposed && token === generation) mount(data, file?.name ?? "Car rig", car)
    } catch (e) {
      if (!disposed && token === generation) $("error").textContent = String(e)
    }
  }
  $("demo").onclick = () => {
    generation++
    attempt(() => mount(demoRig, "Built-in arm"))
  }
  $("car").onclick = () => void load(true)
  input("file").onchange = () => {
    const file = input("file").files?.[0]
    if (file) void load(false, file)
  }
  $("play").onclick = () => {
    playing = !playing
    $("play").textContent = playing ? "Pause" : "Play"
    wake()
  }
  $("rest").onclick = () => {
    pause()
    rig.reset()
    time = 0
    wake()
  }
  select("clip").onchange = () =>
    attempt(() => {
      pause()
      time = 0
      input("time").max = String(animator.clips[Number(select("clip").value)].duration)
      animator.sample(Number(select("clip").value), 0)
      wake()
    })
  input("time").oninput = () =>
    attempt(() => {
      pause()
      time = Number(input("time").value)
      animator.sample(Number(select("clip").value), time)
      wake()
    })
  for (const name of ["bone", "offset", "yaw"]) $(name).oninput = wake
  const visibility = () => wake()
  document.addEventListener("visibilitychange", visibility)
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    wake()
  })
  observer.observe(root)
  function draw(now: number) {
    if (playing && visible && !document.hidden) {
      const dt = last === undefined ? 0 : Math.min(0.05, (now - last) / 1000)
      time += dt
      time = animator.sample(Number(select("clip").value), time, { loop: true })
      dirty = true
      last = now
      scene.getEngine()?.requestFrame()
    } else last = undefined
    if (!dirty) return
    dirty = false
    const yaw = Number(input("yaw").value),
      view = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
    const position = (m: ArrayLike<number>) =>
      rotateVector3(
        {
          x: (m[12] - center[0]) * fit,
          y: (m[13] - center[1]) * fit,
          z: (m[14] - center[2]) * fit,
        },
        view,
      )
    for (const v of visuals) {
      const b = rig.node(v.id),
        p = position(b.worldMatrix())
      v.joint.setTransform({ positionX: p.x, positionY: p.y, positionZ: p.z })
      v.joint.setUni({ value1: b.id === Number(select("bone").value) ? 0 : 1 })
      if (v.link && b.parent !== null) {
        const parent = position(rig.node(b.parent).worldMatrix()),
          dx = p.x - parent.x,
          dy = p.y - parent.y,
          dz = p.z - parent.z,
          length = Math.hypot(dx, dy, dz)
        const q =
          length < 1e-10
            ? { x: 0, y: 0, z: 0, w: 1 }
            : dy / length < -0.999999
              ? { x: 1, y: 0, z: 0, w: 0 }
              : { x: dz / length, y: 0, z: -dx / length, w: 1 + dy / length }
        const norm = Math.hypot(q.x, q.y, q.z, q.w)
        q.x /= norm
        q.y /= norm
        q.z /= norm
        q.w /= norm
        v.link.setTransform({
          ...poseToTransform(
            { x: (p.x + parent.x) / 2, y: (p.y + parent.y) / 2, z: (p.z + parent.z) / 2 },
            q,
          ),
          scale: Math.max(length, 0.000001),
        })
      }
    }
    const offset = [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      Number(input("offset").value) / fit,
      0,
      0,
      1,
    ]
    const p = position(getSocketMatrix(rig, Number(select("bone").value), offset))
    socket!.setTransform({
      positionX: p.x,
      positionY: p.y,
      positionZ: p.z,
      rotationY: yaw,
    })
    input("time").value = String(time)
    $("time-label").textContent = `${time.toFixed(2)}s`
  }
  const ready = (async () => {
    await scene.getInitPromise()
    if (disposed) return null
    const engine = scene.getEngine()
    if (!engine) throw new Error("No renderer available")
    for (const name of ["demo", "car", "file"]) $<HTMLButtonElement>(name).disabled = false
    mount(demoRig, "Built-in arm")
    unsubscribe = engine.onRender(
      (frame) => {
        const aspect = frame.canvas.width / Math.max(1, frame.canvas.height)
        camera.distance = Math.max(6, 4 / aspect)
        placement.scale = 1 / (0.4 * Math.min(aspect, 1 / aspect))
        attempt(() => draw(frame.now))
      },
      { layer: -100 },
    )
    wake()
    return engine.backend
  })().catch((error) => {
    if (!disposed) {
      $("error").textContent = String(error)
      clear()
      scene.destroy()
      options.onInitError?.(error)
    }
    return null
  })
  return {
    ready,
    getEngine: () => scene.getEngine(),
    destroy() {
      if (disposed) return
      disposed = true
      generation++
      abort.abort()
      unsubscribe?.()
      observer.disconnect()
      document.removeEventListener("visibilitychange", visibility)
      clear()
      scene.destroy()
      root.remove()
    },
  }
}
export const rigBones: ExampleSpec = {
  id: "rig-bones",
  label: "Rig · bones & sockets",
  copy: "Bone references, animation scrubbing and a socket marker. Built-in arm or imported car rig.",
  kind: "view",
  fragment,
  run,
}
