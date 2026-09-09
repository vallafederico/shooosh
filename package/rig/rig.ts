/** Bone references and explicitly evaluated poses. No RAF, DOM, loaders or GPU imports. */
import type { RigDefinition, RigPose, RigTransform } from "./types"
import { affine, compose, identity, multiply, numbers, quaternion } from "./math"
function transform(value: RigTransform) {
  return {
    translation: numbers(value.translation ?? [0, 0, 0], 3, "translation"),
    rotation: quaternion(value.rotation ?? [0, 0, 0, 1]),
    scale: numbers(value.scale ?? [1, 1, 1], 3, "scale"),
  }
}
export function createRig(definition: RigDefinition) {
  if (definition?.version !== 1 || !Array.isArray(definition.nodes))
    throw new Error("Unsupported rig definition")
  const nodes = definition.nodes.map((node, id) => {
    if (node.matrix && (node.translation || node.rotation || node.scale))
      throw new Error("Matrix and TRS are mutually exclusive")
    const parent = node.parent ?? null
    if (
      parent !== null &&
      (!Number.isInteger(parent) || parent < 0 || parent >= definition.nodes.length)
    )
      throw new Error(`Invalid parent for node ${id}`)
    const key = node.key ?? `node__${id}`
    if (
      typeof key !== "string" ||
      !key ||
      (node.name !== undefined && typeof node.name !== "string")
    )
      throw new Error("Invalid node name/key")
    return {
      id,
      key,
      mesh: node.mesh ?? null,
      skin: node.skin ?? null,
      name: node.name ?? "",
      parent,
      matrix: node.matrix ? affine(node.matrix) : null,
      ...transform(node),
    }
  })
  const keys = new Map<string, number>()
  const names = new Map<string, number[]>()
  const children = nodes.map(() => [] as number[])
  const roots: number[] = []
  for (const node of nodes) {
    if (keys.has(node.key)) throw new Error(`Duplicate node key: ${node.key}`)
    keys.set(node.key, node.id)
    if (!names.has(node.name)) names.set(node.name, [])
    names.get(node.name)!.push(node.id)
    if (node.parent === null) roots.push(node.id)
    else children[node.parent].push(node.id)
  }
  const order = roots.slice()
  for (let i = 0; i < order.length; i++)
    for (const child of children[order[i]]) order.push(child)
  if (order.length !== nodes.length) throw new Error("Cyclic rig hierarchy")
  const rootOf = new Array<number>(nodes.length)
  for (const id of order)
    rootOf[id] = nodes[id].parent === null ? id : rootOf[nodes[id].parent!]
  const skins = Object.freeze(
    (definition.skins ?? []).map((skin, id) => {
      const joints = Array.from(skin.joints)
      if (
        !joints.length ||
        new Set(joints).size !== joints.length ||
        joints.some((j) => !Number.isInteger(j) || !nodes[j])
      )
        throw new Error(`Invalid joints in skin ${id}`)
      if (
        skin.skeleton != null &&
        (!Number.isInteger(skin.skeleton) || !nodes[skin.skeleton])
      )
        throw new Error("Invalid skeleton root")
      if (joints.some((j) => rootOf[j] !== rootOf[joints[0]]))
        throw new Error("Skin joints need a common root")
      if (skin.skeleton != null) {
        const descendants = new Set<number>([skin.skeleton]),
          queue = [skin.skeleton]
        for (let i = 0; i < queue.length; i++)
          for (const child of children[queue[i]]) {
            descendants.add(child)
            queue.push(child)
          }
        if (joints.some((j) => !descendants.has(j)))
          throw new Error("Skeleton root is not a joint ancestor")
      }
      const bind = skin.inverseBindMatrices
        ? numbers(skin.inverseBindMatrices, joints.length * 16, "inverse bind matrices")
        : joints.flatMap(() => identity())
      for (let i = 0; i < joints.length; i++) affine(bind.slice(i * 16, i * 16 + 16))
      return Object.freeze({
        id,
        key: skin.key ?? `skin__${id}`,
        name: skin.name ?? "",
        skeleton: skin.skeleton ?? null,
        joints: Object.freeze(joints),
        inverseBindMatrices: Object.freeze(bind),
      })
    }),
  )
  if (new Set(skins.map((s) => s.key)).size !== skins.length)
    throw new Error("Duplicate skin key")
  for (const node of nodes) {
    if (node.skin !== null && (!Number.isInteger(node.skin) || !skins[node.skin]))
      throw new Error("Invalid node skin")
    if (node.mesh !== null && (!Number.isInteger(node.mesh) || node.mesh < 0))
      throw new Error("Invalid node mesh")
  }
  const jointIds = new Set(
    skins.length ? skins.flatMap((s) => [...s.joints]) : nodes.map((n) => n.id),
  )
  let locals = nodes.map((n) => transform(n))
  let worlds = nodes.map(() => identity())
  let dirty = true
  function resolve(ref: number | string): number {
    if (typeof ref === "number") {
      if (!Number.isInteger(ref) || !nodes[ref])
        throw new Error(`Unknown rig node: ${ref}`)
      return ref
    }
    if (keys.has(ref)) return keys.get(ref)!
    const matches = names.get(ref) ?? []
    if (matches.length !== 1)
      throw new Error(
        matches.length
          ? `Ambiguous bone name: ${ref}; use a key or index`
          : `Unknown rig node: ${ref}`,
      )
    return matches[0]
  }
  function update() {
    if (!dirty) return
    const next = new Array<number[]>(nodes.length)
    for (const id of order) {
      const n = nodes[id],
        p = locals[id]
      const local = n.matrix ?? compose(p.translation, p.rotation, p.scale)
      next[id] = n.parent === null ? local.slice() : multiply(next[n.parent], local)
      if (next[id].some((v) => !Number.isFinite(v))) throw new Error("Pose overflow")
    }
    worlds = next
    dirty = false
  }
  /** Apply absolute local TRS patches atomically. reset starts from the imported pose. */
  function setPose(pose: RigPose, options: { reset?: boolean } = {}) {
    const pending = new Map<number, ReturnType<typeof transform>>()
    for (const entry of pose) {
      const id = resolve(entry.node)
      if (nodes[id].matrix) throw new Error("Cannot edit TRS on a static matrix node")
      if (pending.has(id)) throw new Error("Duplicate node pose")
      const base = options.reset ? nodes[id] : locals[id]
      pending.set(
        id,
        transform({
          translation: entry.transform.translation ?? base.translation,
          rotation: entry.transform.rotation ?? base.rotation,
          scale: entry.transform.scale ?? base.scale,
        }),
      )
    }
    if (options.reset) locals = nodes.map((n) => transform(n))
    for (const [id, value] of pending) locals[id] = value
    dirty = true
  }
  const references = Object.freeze(
    nodes.map((n) =>
      Object.freeze({
        id: n.id,
        key: n.key,
        name: n.name,
        parent: n.parent,
        mesh: n.mesh,
        skin: n.skin,
        children: Object.freeze(children[n.id].slice()),
        isJoint: jointIds.has(n.id),
        isStaticMatrix: n.matrix !== null,
        getLocal: () => ({
          translation: locals[n.id].translation.slice(),
          rotation: locals[n.id].rotation.slice(),
          scale: locals[n.id].scale.slice(),
          ...(n.matrix ? { matrix: n.matrix.slice() } : {}),
        }),
        setLocal: (patch: RigTransform) => setPose([{ node: n.id, transform: patch }]),
        worldMatrix: (out: Float64Array = new Float64Array(16)) => {
          if (out.length !== 16) throw new Error("Expected 16-element matrix output")
          update()
          out.set(worlds[n.id])
          return out
        },
      }),
    ),
  )
  return {
    nodes: references,
    bones: Object.freeze(references.filter((n) => n.isJoint)),
    skins,
    node: (ref: number | string) => references[resolve(ref)],
    bone: (ref: number | string) => {
      const id = resolve(ref)
      if (!jointIds.has(id)) throw new Error("Node is not a joint")
      return references[id]
    },
    findBones: (name: string) => references.filter((n) => n.isJoint && n.name === name),
    setPose,
    getPose: (): RigPose =>
      nodes
        .filter((n) => !n.matrix)
        .map((n) => ({ node: n.id, transform: references[n.id].getLocal() })),
    reset: () => {
      locals = nodes.map((n) => transform(n))
      dirty = true
    },
    update,
  }
}
export type Rig = ReturnType<typeof createRig>
