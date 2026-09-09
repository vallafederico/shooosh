import { loadModel } from "../src/shooosh.js"
import type { PreparedModel } from "../src/prepared.js"
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const input = (id: string) => $<HTMLInputElement>(id)
const select = (id: string) => $<HTMLSelectElement>(id)
let canvas = $<HTMLCanvasElement>("canvas")
let model: Awaited<ReturnType<typeof loadModel>> | undefined
let prepared: PreparedModel
let selected: number | null = null
let pageSize = 100
let hidden = new Set<number>()
let patches = new Map<
  number,
  {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
  }
>()
let abort: AbortController | undefined
let generation = 0
let yaw = 0.4,
  pitch = -0.2,
  zoom = 2.3
function failure(error: unknown) {
  $("error").textContent = error instanceof Error ? error.message : String(error)
}
function action(fn: () => void) {
  try {
    $("error").textContent = ""
    fn()
    updateRecipe()
  } catch (error) {
    failure(error)
  }
}
function updateRecipe() {
  const edits = model?.getEdits()
  if (!edits) return
  const lines = [
    '// After: const model = await load(canvas, "/models/Product.model.json");',
  ]
  for (const { id, transform } of edits.transforms)
    lines.push(
      `model.nodes[${JSON.stringify(prepared.manifest.nodes[id].key)}].setTransform(${JSON.stringify(transform)});`,
    )
  for (const [id, material] of edits.assignments)
    lines.push(
      `model.nodes[${JSON.stringify(prepared.manifest.nodes[id].key)}].useMaterial(${JSON.stringify(prepared.manifest.materials[material].key)});`,
    )
  for (const { id, material } of edits.nodes)
    lines.push(
      `model.nodes[${JSON.stringify(prepared.manifest.nodes[id].key)}].setMaterial(${JSON.stringify(material)});`,
    )
  for (const id of edits.hidden)
    lines.push(
      `model.nodes[${JSON.stringify(prepared.manifest.nodes[id].key)}].setVisible(false);`,
    )
  $<HTMLTextAreaElement>("recipe").value = lines.join("\n")
}
function renderTree() {
  const query = input("search").value.toLowerCase()
  const nodes = prepared.manifest.nodes.filter((n) =>
    `${n.id} ${n.name} ${n.key}`.toLowerCase().includes(query),
  )
  const tree = $("tree")
  tree.replaceChildren()
  for (const n of nodes.slice(0, pageSize)) {
    const button = document.createElement("button")
    button.textContent = n.name || `Node ${n.id}`
    button.setAttribute("aria-pressed", String(selected === n.id))
    const detail = document.createElement("small")
    detail.textContent = `#${n.id} · ${n.mesh === null ? "group" : `mesh ${n.mesh}`} · parent ${n.parent ?? "scene"}${model?.nodes[n.key]?.available ? "" : " · outside scene"}`
    button.append(detail)
    button.onclick = () => choose(n.id)
    tree.append(button)
  }
  $("more").hidden = nodes.length <= pageSize
}
function choose(id: number) {
  selected = id
  if (model?.nodes[prepared.manifest.nodes[id].key]?.available) model.select(id)
  const node = prepared.manifest.nodes[id]
  const available = model?.nodes[node.key]?.available
  $("selected").textContent = node.name || `Node ${id}`
  const mesh = prepared.manifest.meshes[node.mesh ?? -1]
  $("selection-info").textContent =
    `${node.key} · ${node.children.length} children · ${node.skin === null ? "rigid" : "skinned (omitted from preview)"}${mesh ? ` · ${mesh.primitives.reduce((n, p) => n + (p.triangles ?? 0), 0).toLocaleString()} triangles · ${mesh.primitives.length} primitives` : ""}`
  $("controls").hidden = !available
  const patch = patches.get(id)
  for (const [i, key] of ["x", "y", "z"].entries())
    input(key).value = String(patch?.position[i] ?? 0)
  input("rotation").value = String(((patch?.rotation[1] ?? 0) * 180) / Math.PI)
  input("scale").value = String(patch?.scale[0] ?? 1)
  $("visible").textContent = hidden.has(id) ? "Show" : "Hide"
  $<HTMLFieldSetElement>("material-controls").disabled =
    node.mesh === null || node.skin !== null
  const first = prepared.manifest.meshes[node.mesh ?? -1]?.primitives[0]?.material
  const base = prepared.manifest.materials[first ?? -1]?.definition.pbrMetallicRoughness
  const override = model?.getEdits().nodes.find((n) => n.id === id)?.material
  const color = override?.color ?? base?.baseColorFactor ?? [0.7, 0.72, 0.75, 1]
  input("color").value =
    "#" +
    color
      .slice(0, 3)
      .map((c) =>
        Math.round(Math.pow(c, 1 / 2.2) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  input("metallic").value = String(override?.metallic ?? base?.metallicFactor ?? 1)
  input("roughness").value = String(override?.roughness ?? base?.roughnessFactor ?? 1)
  renderTree()
}
async function mount() {
  const token = ++generation
  abort?.abort()
  model?.destroy()
  model = undefined
  abort = new AbortController()
  selected = null
  hidden.clear()
  patches.clear()
  $("controls").hidden = true
  $("error").textContent = ""
  $("status").textContent = "Preparing GPU…"
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement
  canvas.replaceWith(replacement)
  canvas = replacement
  wireCanvas()
  renderTree()
  $("selected").textContent = "Choose a part"
  $("selection-info").textContent = "Select a named node in the scene tree."
  try {
    const loaded = await loadModel(canvas, "./model.json", {
      backend: select("backend").value as "auto" | "webgpu" | "webgl2",
      scene: Number(select("scene").value),
      signal: abort.signal,
    })
    if (token !== generation) {
      loaded.destroy()
      return
    }
    model = loaded
    model.setTextured(select("appearance").value === "textured")
    model.setView({ rotationX: pitch, rotationY: yaw, scale: zoom })
    $("status").textContent =
      `${model.backend} · ${prepared.manifest.stats.meshInstances} mesh instances · ${model.textureCount} base-color textures`
    renderTree()
    updateRecipe()
  } catch (error) {
    if (token === generation) {
      $("status").textContent = "Preview unavailable"
      failure(error)
    }
  }
}
input("search").oninput = () => {
  pageSize = 100
  renderTree()
}
$("more").onclick = () => {
  pageSize += 100
  renderTree()
}
select("appearance").onchange = () =>
  action(() => model?.setTextured(select("appearance").value === "textured"))
select("backend").onchange = () => void mount()
select("scene").onchange = () => void mount()
$("transform").onclick = () =>
  action(() => {
    if (selected === null || !model) return
    const patch = {
      position: ["x", "y", "z"].map((k) => Number(input(k).value)) as [
        number,
        number,
        number,
      ],
      rotation: [0, (Number(input("rotation").value) * Math.PI) / 180, 0] as [
        number,
        number,
        number,
      ],
      scale: [1, 1, 1].map(() => Number(input("scale").value)) as [
        number,
        number,
        number,
      ],
    }
    model.nodes[prepared.manifest.nodes[selected].key].setTransform(patch)
    patches.set(selected, patch)
  })
$("visible").onclick = () =>
  action(() => {
    if (selected === null || !model) return
    const show = hidden.has(selected)
    model.nodes[prepared.manifest.nodes[selected].key].setVisible(show)
    if (show) hidden.delete(selected)
    else hidden.add(selected)
    choose(selected)
  })
$("isolate").onclick = () =>
  action(() => {
    if (selected === null || !model) return
    model.isolate(prepared.manifest.nodes[selected].key)
    hidden = new Set(model.getEdits().hidden)
    choose(selected)
  })
$("material").onclick = () =>
  action(() => {
    if (selected === null || !model) return
    const hex = input("color").value
    const color = [1, 3, 5].map((i) =>
      Math.pow(parseInt(hex.slice(i, i + 2), 16) / 255, 2.2),
    )
    model.nodes[prepared.manifest.nodes[selected].key].setMaterial({
      color: [color[0], color[1], color[2], 1],
      metallic: Number(input("metallic").value),
      roughness: Number(input("roughness").value),
    })
  })
$("assign").onclick = () =>
  action(() => {
    if (selected !== null && model)
      model.nodes[prepared.manifest.nodes[selected].key].useMaterial(
        select("material-list").value,
      )
  })
$("reset").onclick = () =>
  action(() => {
    model?.reset()
    hidden.clear()
    patches.clear()
    if (selected !== null) choose(selected)
  })
function updateView() {
  action(() => model?.setView({ rotationX: pitch, rotationY: yaw, scale: zoom }))
  input("yaw").value = String(yaw)
}
$("frame").onclick = () => {
  yaw = 0.4
  pitch = -0.2
  zoom = 2.3
  updateView()
}
input("yaw").oninput = () => {
  yaw = Number(input("yaw").value)
  updateView()
}
function wireCanvas() {
  let drag: { x: number; y: number } | null = null
  let dragStart: { x: number; y: number } | null = null
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId)
    drag = { x: e.clientX, y: e.clientY }
    dragStart = { ...drag }
  }
  canvas.onpointermove = (e) => {
    if (!drag) return
    yaw += (e.clientX - drag.x) * 0.008
    pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - drag.y) * 0.008))
    drag = { x: e.clientX, y: e.clientY }
    updateView()
  }
  canvas.onpointerup = (e) => {
    if (dragStart && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 4) {
      const rect = canvas.getBoundingClientRect()
      const id = model?.pick(
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
      )
      if (id !== null && id !== undefined) choose(id)
    }
    drag = null
    dragStart = null
  }
  canvas.onpointercancel = () => {
    drag = null
    dragStart = null
  }
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault()
      zoom = Math.max(0.2, Math.min(12, zoom * Math.exp(-e.deltaY * 0.001)))
      updateView()
    },
    { passive: false },
  )
}
$("download").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([$<HTMLTextAreaElement>("recipe").value], { type: "text/javascript" }),
  )
  const a = document.createElement("a")
  a.href = url
  a.download = "model-operations.js"
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
window.addEventListener("pagehide", () => {
  generation++
  abort?.abort()
  model?.destroy()
})
try {
  const response = await fetch("./model.json")
  if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`)
  prepared = await response.json()
  for (const scene of prepared.manifest.scenes) {
    const option = document.createElement("option")
    option.value = String(scene.id)
    option.textContent = scene.name || `Scene ${scene.id}`
    select("scene").append(option)
  }
  select("scene").value = String(prepared.manifest.defaultScene ?? 0)
  for (const material of prepared.manifest.materials) {
    const option = document.createElement("option")
    option.value = material.key
    option.textContent = material.name || material.key
    select("material-list").append(option)
  }
  $("counts").textContent =
    `${prepared.manifest.stats.nodes} nodes · ${prepared.manifest.stats.uniqueMeshTriangles.toLocaleString()} unique mesh triangles`
  $("inventory").textContent = JSON.stringify(
    {
      stats: prepared.manifest.stats,
      animations: prepared.manifest.animations,
      cameras: prepared.manifest.cameras,
      skins: prepared.manifest.skins,
      images: prepared.manifest.images,
      extensionsUsed: prepared.manifest.extensionsUsed,
      extensions: prepared.manifest.extensions,
    },
    null,
    2,
  )
  for (const limit of prepared.limitations) {
    const li = document.createElement("li")
    li.textContent = limit
    $("limits").append(li)
  }
  renderTree()
  await mount()
} catch (error) {
  failure(error)
  $("status").textContent = "Unable to open model"
}
