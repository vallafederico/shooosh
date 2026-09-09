/** Rigid glTF workbench adapter using shooosh's public API on both backends. */
import {
  createCanvasScene,
  createObject,
  loadTexture,
  getDefaultEngine,
  type ObjectController,
} from "shooosh"
import {
  bindModel,
  type MaterialPatch,
  type Transform,
  type ModelAdapter,
} from "./runtime.js"
import type { PreparedModel } from "./prepared.js"
import { bake, compose, eulerQuaternion, identity, multiply, point } from "./math.js"
import shader from "./material.js"
import texturedShader from "./textured-material.js"
export type LoadModelOptions = {
  backend?: "auto" | "webgpu" | "webgl2"
  scene?: number
  signal?: AbortSignal
  sourceHash?: string
  maxVertices?: number
  maxDraws?: number
}
export async function loadModel(
  canvas: HTMLCanvasElement,
  url: string,
  options: LoadModelOptions = {},
) {
  const metadataUrl = new URL(url, document.baseURI)
  const response = await fetch(metadataUrl, { signal: options.signal })
  if (!response.ok) throw new Error(`Model metadata: HTTP ${response.status}`)
  const prepared = (await response.json()) as PreparedModel
  if (prepared.version !== 1 || !prepared.manifest || !Array.isArray(prepared.geometry))
    throw new Error("Unsupported prepared model")
  if (options.sourceHash && options.sourceHash !== prepared.manifest.sourceHash)
    throw new Error("Generated interface does not match this model; regenerate it")
  const binaryResponse = await fetch(new URL(prepared.binary, metadataUrl), {
    signal: options.signal,
  })
  if (!binaryResponse.ok) throw new Error(`Model geometry: HTTP ${binaryResponse.status}`)
  const binary = await binaryResponse.arrayBuffer()
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", binary)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("")
  if (hash !== prepared.binaryHash)
    throw new Error("Model binary does not match the prepared manifest")
  options.signal?.throwIfAborted()
  return mountModel(canvas, prepared, binary, options)
}
export async function mountModel(
  canvas: HTMLCanvasElement,
  prepared: PreparedModel,
  binary: ArrayBuffer,
  options: LoadModelOptions = {},
) {
  const manifest = prepared.manifest
  const source = prepared.geometry.map((g) => {
    for (const value of [
      g.verticesOffset,
      g.verticesCount,
      g.indicesOffset,
      g.indicesCount,
    ])
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Invalid geometry range")
    if (
      g.verticesOffset % 4 ||
      g.indicesOffset % 4 ||
      g.verticesCount % 6 ||
      g.indicesCount % 3 ||
      g.verticesOffset + g.verticesCount * 4 > binary.byteLength ||
      g.indicesOffset + g.indicesCount * 4 > binary.byteLength
    )
      throw new Error("Geometry range outside binary")
    const vertices = new Float32Array(binary, g.verticesOffset, g.verticesCount)
    const indices = new Uint32Array(binary, g.indicesOffset, g.indicesCount)
    if (
      vertices.some((v) => !Number.isFinite(v)) ||
      indices.some((i) => i >= vertices.length / 6)
    )
      throw new Error("Invalid geometry values")
    let uvs: Float32Array | undefined
    if (g.uvOffset !== undefined) {
      if (
        !Number.isSafeInteger(g.uvOffset) ||
        g.uvOffset < 0 ||
        g.uvOffset % 4 ||
        g.uvOffset + (vertices.length / 6) * 8 > binary.byteLength
      )
        throw new Error("Invalid UV range")
      uvs = new Float32Array(binary, g.uvOffset, vertices.length / 3)
      if (uvs.some((v) => !Number.isFinite(v))) throw new Error("Invalid UV values")
    }
    return { ...g, vertices, indices, uvs }
  })
  const sceneId = options.scene ?? manifest.defaultScene ?? 0
  const selectedScene = manifest.scenes[sceneId]
  if (!selectedScene) throw new Error(`Unknown scene ${sceneId}`)
  const active = new Set<number>()
  const queue = [...selectedScene.roots]
  while (queue.length) {
    const id = queue.pop()!
    if (active.has(id)) throw new Error("Invalid scene hierarchy")
    active.add(id)
    queue.push(...manifest.nodes[id].children)
  }
  const byMesh = new Map<number, typeof source>()
  for (const g of source) {
    if (!byMesh.has(g.mesh)) byMesh.set(g.mesh, [])
    byMesh.get(g.mesh)!.push(g)
  }
  const renderNodes = manifest.nodes.filter(
    (n) => active.has(n.id) && n.mesh !== null && n.skin === null && byMesh.has(n.mesh),
  )
  const renderNodeIds = new Set(renderNodes.map((node) => node.id))
  const draws = renderNodes.reduce((n, node) => n + byMesh.get(node.mesh!)!.length, 0)
  const vertices = renderNodes.reduce(
    (n, node) =>
      n + byMesh.get(node.mesh!)!.reduce((s, g) => s + g.vertices.length / 6, 0),
    0,
  )
  if (draws > (options.maxDraws ?? 1024) || vertices > (options.maxVertices ?? 5_000_000))
    throw new Error(
      `Preview budget exceeded: ${draws} draws, ${vertices} vertices. Inspect/optimize first or explicitly raise maxDraws/maxVertices.`,
    )
  const delta = new Map<number, Transform>()
  const hidden = new Set<number>()
  const overrides = new Map<number, MaterialPatch>()
  const assignments = new Map<number, number>()
  const controllers = new Map<
    number,
    { object: ObjectController; material: number | null }[]
  >()
  let worlds: number[][] = []
  let selectedNode: number | null = null
  const pickGeometry = new Map<
    number,
    { vertices: Float32Array; indices: Uint32Array }[]
  >()
  function computeWorlds() {
    worlds = new Array(manifest.nodes.length)
    const stack: { id: number; parent: number[] }[] = selectedScene.roots.map((id) => ({
      id,
      parent: identity(),
    }))
    while (stack.length) {
      const { id, parent } = stack.pop()!
      const node = manifest.nodes[id]
      const change = delta.get(id) ?? {}
      const original = node.matrix ?? compose(node.translation, node.rotation, node.scale)
      const offset = compose(
        change.position ?? [0, 0, 0],
        eulerQuaternion(change.rotation ?? [0, 0, 0]),
        change.scale ?? [1, 1, 1],
      )
      worlds[id] = multiply(parent, multiply(original, offset))
      for (const child of node.children) stack.push({ id: child, parent: worlds[id] })
    }
  }
  computeWorlds()
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity]
  for (const node of renderNodes)
    for (const g of byMesh.get(node.mesh!)!)
      for (let k = 0; k < g.vertices.length; k += 6) {
        const p = point(
          worlds[node.id],
          g.vertices[k],
          g.vertices[k + 1],
          g.vertices[k + 2],
        )
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], p[axis])
          max[axis] = Math.max(max[axis], p[axis])
        }
      }
  const extent = Number.isFinite(min[0])
    ? Math.max(...max.map((v, i) => v - min[i]), 0.001)
    : 1
  const center = Number.isFinite(min[0]) ? min.map((v, i) => (v + max[i]) / 2) : [0, 0, 0]
  const normalization = compose(
    center.map((v) => (-v * 2) / extent),
    [0, 0, 0, 1],
    [2 / extent, 2 / extent, 2 / extent],
  )
  const scene = createCanvasScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.035, g: 0.043, b: 0.055, a: 1 },
  })
  try {
    await scene.getInitPromise()
    options.signal?.throwIfAborted()
  } catch (error) {
    scene.destroy()
    throw error
  }
  const textures = new Map<number, Awaited<ReturnType<typeof loadTexture>>>()
  try {
    for (const image of prepared.textures ?? []) {
      if (
        ![image.offset, image.length, image.material].every(
          (v) => Number.isSafeInteger(v) && v >= 0,
        ) ||
        image.offset + image.length > binary.byteLength ||
        !manifest.materials[image.material]
      )
        throw new Error("Invalid preview texture range")
      if (textures.has(image.material))
        throw new Error("Duplicate preview material texture")
      const bitmap = await createImageBitmap(
        new Blob([binary.slice(image.offset, image.offset + image.length)], {
          type: "image/png",
        }),
        { colorSpaceConversion: "none", premultiplyAlpha: "none" },
      )
      try {
        const texture = await loadTexture(bitmap, {
          engine: scene.getEngine()!,
          flipY: false,
        })
        textures.set(image.material, texture)
      } finally {
        bitmap.close()
      }
      options.signal?.throwIfAborted()
    }
  } catch (error) {
    for (const texture of textures.values()) texture.destroy()
    scene.destroy()
    throw error
  }
  let textured = true
  let disposed = false
  let view = { rotationX: -0.2, rotationY: 0.4, scale: 2.3 }
  function current() {
    if (disposed) throw new Error("Model has been destroyed")
    if (getDefaultEngine() !== scene.getEngine())
      throw new Error("This model canvas is no longer the active shooosh engine")
  }
  function wrapMode(value: number | undefined) {
    return value === 33071 ? 0 : value === 33648 ? 2 : 1
  }
  function uniforms(node: number, material: number | null) {
    const definition =
      manifest.materials[assignments.get(node) ?? material ?? -1]?.definition
        .pbrMetallicRoughness
    const patch = overrides.get(node)
    const color = patch?.color ?? definition?.baseColorFactor ?? [0.7, 0.72, 0.75, 1]
    return {
      value1: color[0],
      value2: color[1],
      value3: color[2],
      value5: patch?.metallic ?? definition?.metallicFactor ?? 1,
      value6: patch?.roughness ?? definition?.roughnessFactor ?? 1,
      value7: selectedNode === node ? 1 : 0,
      value8: textured ? 1 : 0,
      value9: wrapMode(
        prepared.textures?.find((t) => t.material === (assignments.get(node) ?? material))
          ?.wrapS,
      ),
      value10: wrapMode(
        prepared.textures?.find((t) => t.material === (assignments.get(node) ?? material))
          ?.wrapT,
      ),
    }
  }
  function isVisible(id: number) {
    let node: number | null = id
    while (node !== null) {
      if (hidden.has(node)) return false
      node = manifest.nodes[node].parent
    }
    return true
  }
  function refresh(ids: Set<number>) {
    current()
    computeWorlds()
    // Prepare CPU geometry before replacing good renderers, so invalid edits leave the old view intact.
    const pending: {
      id: number
      geometry: ReturnType<typeof bake>
      source: (typeof source)[number]
    }[] = []
    for (const node of renderNodes)
      if (ids.has(node.id) && isVisible(node.id))
        for (const g of byMesh.get(node.mesh!)!)
          pending.push({
            id: node.id,
            geometry: bake(g.vertices, multiply(normalization, worlds[node.id])),
            source: g,
          })
    for (const id of ids) {
      for (const { object } of controllers.get(id) ?? []) object.destroy()
      controllers.delete(id)
      pickGeometry.delete(id)
    }
    for (const part of pending) {
      const indices = part.geometry.mirrored
        ? part.source.indices.slice()
        : part.source.indices
      if (part.geometry.mirrored)
        for (let i = 0; i < indices.length; i += 3)
          [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
      const texture = part.source.uvs
        ? textures.get(assignments.get(part.id) ?? part.source.material ?? -1)
        : undefined
      let renderVertices = part.geometry.vertices
      if (texture) {
        renderVertices = new Float32Array((part.geometry.vertices.length / 6) * 8)
        for (let i = 0; i < part.geometry.vertices.length / 6; i++) {
          renderVertices.set(part.geometry.vertices.subarray(i * 6, i * 6 + 6), i * 8)
          renderVertices.set(part.source.uvs!.subarray(i * 2, i * 2 + 2), i * 8 + 6)
        }
      }
      const object = createObject(null, {
        shape: {
          type: "custom",
          vertices: renderVertices,
          indices,
          vertexStride: texture ? 8 : 6,
        },
        shaders: texture ? texturedShader : shader,
        envMap: texture?.texture,
        ...view,
        frustumCulling: false,
        camera: { distance: 3.5, far: 100 },
        uni: uniforms(part.id, part.source.material),
      })
      if (!controllers.has(part.id)) controllers.set(part.id, [])
      controllers.get(part.id)!.push({ object, material: part.source.material })
      if (!pickGeometry.has(part.id)) pickGeometry.set(part.id, [])
      pickGeometry.get(part.id)!.push({ vertices: part.geometry.vertices, indices })
    }
  }
  function descendants(id: number) {
    if (!active.has(id)) throw new Error(`Node ${id} is outside the active scene`)
    const found = new Set<number>()
    const stack = [id]
    while (stack.length) {
      const n = stack.pop()!
      found.add(n)
      stack.push(...manifest.nodes[n].children)
    }
    return found
  }
  const adapter: ModelAdapter = {
    hasNode: (id) => active.has(id),
    transform(id, patch) {
      const ids = descendants(id)
      if (patch.scale?.some((v) => Math.abs(v) < 1e-6))
        throw new Error("Scale must be nonzero")
      const old = delta.get(id)
      delta.set(id, { ...old, ...patch })
      try {
        refresh(ids)
      } catch (error) {
        if (old) delta.set(id, old)
        else delta.delete(id)
        throw error
      }
    },
    visible(id, value) {
      const ids = descendants(id)
      if (value) hidden.delete(id)
      else hidden.add(id)
      refresh(ids)
    },
    visibility(changes) {
      for (const [id, value] of changes) {
        if (value) hidden.delete(id)
        else hidden.add(id)
      }
      refresh(active)
    },
    material(id, patch) {
      current()
      if (!renderNodeIds.has(id))
        throw new Error("Select a rigid mesh to edit its material")
      overrides.set(id, { ...overrides.get(id), ...patch })
      for (const part of controllers.get(id) ?? [])
        part.object.setUni(uniforms(id, part.material))
    },
    assignMaterial(id, material) {
      current()
      if (!renderNodeIds.has(id)) throw new Error("Select a rigid mesh")
      assignments.set(id, material)
      overrides.delete(id)
      refresh(new Set([id]))
    },
    play() {
      throw new Error(
        "Authored animation playback is not supported by the rigid shooosh adapter",
      )
    },
    stop() {},
    reset() {
      delta.clear()
      hidden.clear()
      overrides.clear()
      assignments.clear()
      refresh(active)
    },
    destroy() {
      if (disposed) return
      disposed = true
      for (const parts of controllers.values())
        for (const { object } of parts) object.destroy()
      controllers.clear()
      pickGeometry.clear()
      for (const texture of textures.values()) texture.destroy()
      textures.clear()
      scene.destroy()
      options.signal?.removeEventListener("abort", abort)
    },
  }
  const model = bindModel(manifest, adapter)
  const abort = () => model.destroy()
  options.signal?.addEventListener("abort", abort, { once: true })
  try {
    refresh(active)
  } catch (error) {
    model.destroy()
    throw error
  }
  return {
    ...model,
    limitations: prepared.limitations,
    textureCount: textures.size,
    setTextured(enabled: boolean) {
      current()
      textured = enabled
      for (const [id, parts] of controllers)
        for (const part of parts) part.object.setUni(uniforms(id, part.material))
    },
    backend: scene.getEngine()?.backend,
    setView(patch: { rotationX?: number; rotationY?: number; scale?: number }) {
      current()
      if (
        Object.values(patch).some((v) => !Number.isFinite(v)) ||
        (patch.scale !== undefined && patch.scale <= 0)
      )
        throw new Error("Invalid view")
      view = { ...view, ...patch }
      for (const parts of controllers.values())
        for (const { object } of parts) object.setTransform(view)
    },
    select(id: number | null) {
      current()
      if (id !== null && !active.has(id)) throw new Error("Unknown active node")
      selectedNode = id
      for (const [node, parts] of controllers)
        for (const part of parts) part.object.setUni(uniforms(node, part.material))
    },
    /** CPU triangle picking on click; no continuous raycast or GPU readback. UV is top-origin. */
    pick(u: number, v: number) {
      current()
      const aspect = canvas.width / Math.max(canvas.height, 1)
      const f = Math.tan((25 * Math.PI) / 180)
      const rotation = compose(
        [0, 0, 0],
        eulerQuaternion([view.rotationX, view.rotationY, 0]),
        [1, 1, 1],
      )
      const inverse = (x: number, y: number, z: number) => [
        rotation[0] * x + rotation[1] * y + rotation[2] * z,
        rotation[4] * x + rotation[5] * y + rotation[6] * z,
        rotation[8] * x + rotation[9] * y + rotation[10] * z,
      ]
      const scale =
        ((0.4 * Math.min(canvas.width, canvas.height)) /
          Math.max(canvas.width, canvas.height)) *
        view.scale
      const origin = inverse(0, 0, 3.5).map((n) => n / scale)
      const direction = inverse((u * 2 - 1) * f * aspect, (1 - v * 2) * f, -1)
      let nearest = Infinity
      let found: number | null = null
      for (const [id, parts] of pickGeometry)
        for (const { vertices, indices } of parts)
          for (let k = 0; k < indices.length; k += 3) {
            const a = indices[k] * 6,
              b = indices[k + 1] * 6,
              c = indices[k + 2] * 6
            const ex = vertices[b] - vertices[a],
              ey = vertices[b + 1] - vertices[a + 1],
              ez = vertices[b + 2] - vertices[a + 2]
            const fx = vertices[c] - vertices[a],
              fy = vertices[c + 1] - vertices[a + 1],
              fz = vertices[c + 2] - vertices[a + 2]
            const px = direction[1] * fz - direction[2] * fy,
              py = direction[2] * fx - direction[0] * fz,
              pz = direction[0] * fy - direction[1] * fx
            const det = ex * px + ey * py + ez * pz
            if (Math.abs(det) < 1e-10) continue
            const tx = origin[0] - vertices[a],
              ty = origin[1] - vertices[a + 1],
              tz = origin[2] - vertices[a + 2]
            const bu = (tx * px + ty * py + tz * pz) / det
            if (bu < 0 || bu > 1) continue
            const qx = ty * ez - tz * ey,
              qy = tz * ex - tx * ez,
              qz = tx * ey - ty * ex
            const bv = (direction[0] * qx + direction[1] * qy + direction[2] * qz) / det
            if (bv < 0 || bu + bv > 1) continue
            const distance = (fx * qx + fy * qy + fz * qz) / det
            if (distance > 0 && distance < nearest) {
              nearest = distance
              found = id
            }
          }
      return found
    },
    getEdits() {
      return {
        nodes: [...overrides].map(([id, material]) => ({ id, material })),
        transforms: [...delta].map(([id, transform]) => ({ id, transform })),
        hidden: [...hidden],
        assignments: [...assignments],
      }
    },
  }
}
