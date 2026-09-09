/** Metadata-only scene index. IDs refer to indices in one exact glTF artifact. */
export type Gltf = {
  asset: { version: string; generator?: string; copyright?: string }
  scene?: number
  scenes?: { name?: string; nodes?: number[] }[]
  nodes?: {
    name?: string
    children?: number[]
    mesh?: number
    skin?: number
    camera?: number
    translation?: number[]
    rotation?: number[]
    scale?: number[]
    matrix?: number[]
    extras?: unknown
    extensions?: Record<string, unknown>
  }[]
  meshes?: {
    name?: string
    primitives: {
      attributes: Record<string, number>
      indices?: number
      material?: number
      mode?: number
      targets?: unknown[]
      extensions?: Record<string, unknown>
    }[]
  }[]
  materials?: {
    name?: string
    pbrMetallicRoughness?: {
      baseColorFactor?: number[]
      metallicFactor?: number
      roughnessFactor?: number
    }
    [key: string]: unknown
  }[]
  accessors?: {
    count: number
    type: string
    componentType: number
    min?: number[]
    max?: number[]
  }[]
  buffers?: { uri?: string; byteLength: number }[]
  images?: { name?: string; uri?: string; mimeType?: string; bufferView?: number }[]
  textures?: { name?: string; source?: number }[]
  cameras?: { name?: string; type: string }[]
  skins?: { name?: string; joints: number[] }[]
  animations?: {
    name?: string
    channels: { target: { node?: number; path: string } }[]
    samplers: { input: number; output: number; interpolation?: string }[]
  }[]
  samplers?: {
    name?: string
    magFilter?: number
    minFilter?: number
    wrapS?: number
    wrapT?: number
  }[]
  extensions?: Record<string, unknown>
  extensionsUsed?: string[]
  extensionsRequired?: string[]
}
export type ModelManifest = ReturnType<typeof inspectJson>
export function partKey(name: string | undefined, kind: string, index: number) {
  return `${(name || kind).replace(/[^a-zA-Z0-9_$]/g, "_").replace(/^[0-9]/, "_$&")}__${index}`
}
export function inspectJson(json: Gltf, sourceHash = "") {
  if (json?.asset?.version !== "2.0") throw new Error("Expected a glTF 2.0 document")
  const nodes = json.nodes ?? []
  const parents = new Map<number, number>()
  for (const [i, node] of nodes.entries())
    for (const child of node.children ?? []) {
      if (!Number.isInteger(child) || !nodes[child])
        throw new Error(`Invalid child ${child} on node ${i}`)
      if (parents.has(child)) throw new Error(`Node ${child} has multiple parents`)
      parents.set(child, i)
    }
  // Iterative cycle detection also handles very deep model hierarchies.
  const complete = new Set<number>()
  for (let i = 0; i < nodes.length; i++) {
    const path = new Set<number>()
    let cursor: number | undefined = i
    while (cursor !== undefined && !complete.has(cursor)) {
      if (path.has(cursor)) throw new Error(`Cycle at node ${cursor}`)
      path.add(cursor)
      cursor = parents.get(cursor)
    }
    for (const node of path) complete.add(node)
  }
  const meshes = (json.meshes ?? []).map((mesh, id) => ({
    id,
    key: partKey(mesh.name, "mesh", id),
    name: mesh.name ?? "",
    primitives: mesh.primitives.map((p, index) => {
      const position = json.accessors?.[p.attributes.POSITION]
      const count =
        p.indices === undefined ? position?.count : json.accessors?.[p.indices]?.count
      const mode = p.mode ?? 4
      return {
        index,
        material: p.material ?? null,
        mode,
        vertices: position?.count ?? null,
        triangles:
          count === undefined
            ? null
            : mode === 4
              ? Math.floor(count / 3)
              : mode === 5 || mode === 6
                ? Math.max(0, count - 2)
                : 0,
        bounds:
          position?.min && position.max ? { min: position.min, max: position.max } : null,
        morphTargets: p.targets?.length ?? 0,
        extensions: Object.keys(p.extensions ?? {}),
      }
    }),
  }))
  const warnings: string[] = []
  if ((json.skins?.length ?? 0) > 0)
    warnings.push("Contains skins: requires a renderer with skeletal animation support.")
  if ((json.extensionsRequired?.length ?? 0) > 0)
    warnings.push(`Required extensions: ${json.extensionsRequired!.join(", ")}`)
  if (nodes.some((n) => n.mesh !== undefined || n.camera !== undefined))
    warnings.push(
      "The shooosh core loadGlb API imports geometry only; the model workbench renders rigid geometry with an approximate material.",
    )
  return {
    version: 1 as const,
    sourceHash,
    asset: json.asset,
    defaultScene: json.scene ?? null,
    scenes: (json.scenes ?? []).map((s, id) => ({
      id,
      name: s.name ?? "",
      roots: s.nodes ?? [],
    })),
    nodes: nodes.map((n, id) => ({
      id,
      key: partKey(n.name, "node", id),
      name: n.name ?? "",
      parent: parents.get(id) ?? null,
      children: n.children ?? [],
      mesh: n.mesh ?? null,
      skin: n.skin ?? null,
      camera: n.camera ?? null,
      translation: n.translation ?? [0, 0, 0],
      rotation: n.rotation ?? [0, 0, 0, 1],
      scale: n.scale ?? [1, 1, 1],
      matrix: n.matrix ?? null,
      extras: n.extras ?? null,
      extensions: n.extensions ?? {},
    })),
    meshes,
    materials: (json.materials ?? []).map((m, id) => ({
      id,
      key: partKey(m.name, "material", id),
      name: m.name ?? "",
      definition: m,
    })),
    animations: (json.animations ?? []).map((a, id) => ({
      id,
      key: partKey(a.name, "animation", id),
      name: a.name ?? "",
      targets: a.channels.map((c) => c.target),
      duration: Math.max(
        0,
        ...a.samplers.map((s) => json.accessors?.[s.input]?.max?.[0] ?? 0),
      ),
    })),
    extensions: json.extensions ?? {},
    buffers: json.buffers ?? [],
    samplers: json.samplers ?? [],
    cameras: json.cameras ?? [],
    skins: json.skins ?? [],
    images: json.images ?? [],
    textures: json.textures ?? [],
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    stats: {
      nodes: nodes.length,
      meshes: meshes.length,
      primitives: meshes.reduce((sum, m) => sum + m.primitives.length, 0),
      meshInstances: nodes.filter((n) => n.mesh !== undefined).length,
      instancedTriangles: nodes.reduce(
        (sum, n) =>
          sum +
          (meshes[n.mesh ?? -1]?.primitives.reduce(
            (count, p) => count + (p.triangles ?? 0),
            0,
          ) ?? 0),
        0,
      ),
      uniqueMeshTriangles: meshes.reduce(
        (sum, m) => sum + m.primitives.reduce((n, p) => n + (p.triangles ?? 0), 0),
        0,
      ),
      declaredBufferBytes: (json.buffers ?? []).reduce((sum, b) => sum + b.byteLength, 0),
      materials: json.materials?.length ?? 0,
      textures: json.textures?.length ?? 0,
      animations: json.animations?.length ?? 0,
    },
    warnings,
  }
}
