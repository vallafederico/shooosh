/** Zero-dependency controller contract. Renderers implement this adapter. */
import type { ModelManifest } from "./manifest.js"
export { inspectJson, partKey } from "./manifest.js"
export type { ModelManifest, Gltf } from "./manifest.js"
export type Vec3 = readonly [number, number, number]
export type Color4 = readonly [number, number, number, number]
export type MaterialPatch = { color?: Color4; metallic?: number; roughness?: number }
export type Transform = { position?: Vec3; rotation?: Vec3; scale?: Vec3 }
export type ModelAdapter = {
  hasNode(id: number): boolean
  transform(id: number, patch: Transform): void
  visible(id: number, value: boolean): void
  visibility?(changes: [number, boolean][]): void
  material(id: number, patch: MaterialPatch): void
  assignMaterial(id: number, material: number): void
  play(id: number, loop: boolean): void
  stop(id?: number): void
  reset(): void
  destroy(): void
}
export function validateTransform(patch: Transform) {
  for (const [key, value] of Object.entries(patch)) {
    if (
      !["position", "rotation", "scale"].includes(key) ||
      !Array.isArray(value) ||
      value.length !== 3 ||
      !value.every(Number.isFinite)
    )
      throw new Error(`Invalid transform ${key}`)
  }
}
export function validateMaterial(patch: MaterialPatch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === "color") {
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        !value.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      )
        throw new Error("Color must be four linear RGBA values in [0,1]")
    } else if (
      !["metallic", "roughness"].includes(key) ||
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    )
      throw new Error(`Invalid material ${key}`)
  }
}
export function bindModel(manifest: ModelManifest, adapter: ModelAdapter) {
  let destroyed = false
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  function alive() {
    if (destroyed) throw new Error("Model has been destroyed")
  }
  const nodes = Object.fromEntries(
    manifest.nodes.map((node) => [
      node.key,
      {
        id: node.id,
        name: node.name,
        get available() {
          return !destroyed && adapter.hasNode(node.id)
        },
        setTransform(patch: Transform) {
          alive()
          validateTransform(patch)
          adapter.transform(node.id, patch)
        },
        setVisible(value: boolean) {
          alive()
          adapter.visible(node.id, value)
        },
        setMaterial(patch: MaterialPatch) {
          alive()
          validateMaterial(patch)
          adapter.material(node.id, patch)
        },
        useMaterial(key: string) {
          alive()
          const material = manifest.materials.find((m) => m.key === key)
          if (!material) throw new Error(`Unknown material ${key}`)
          adapter.assignMaterial(node.id, material.id)
        },
      },
    ]),
  )
  const animations = Object.fromEntries(
    manifest.animations.map((clip) => [
      clip.key,
      {
        play(options: { loop?: boolean } = {}) {
          alive()
          adapter.play(clip.id, options.loop ?? true)
        },
        stop() {
          alive()
          adapter.stop(clip.id)
        },
      },
    ]),
  )
  return {
    manifest,
    nodes,
    animations,
    isolate(key: string) {
      alive()
      const selected = manifest.nodes.find((n) => n.key === key)
      if (!selected) throw new Error(`Unknown node ${key}`)
      const keep = new Set<number>()
      const pending = [selected.id]
      while (pending.length) {
        const id = pending.pop()!
        keep.add(id)
        pending.push(...manifest.nodes[id].children)
      }
      let parent = selected.parent
      while (parent !== null) {
        keep.add(parent)
        parent = manifest.nodes[parent].parent
      }
      const changes: [number, boolean][] = manifest.nodes
        .filter((node) => adapter.hasNode(node.id))
        .map((node) => [node.id, keep.has(node.id)])
      if (adapter.visibility) adapter.visibility(changes)
      else for (const [id, value] of changes) adapter.visible(id, value)
    },
    reset() {
      alive()
      adapter.reset()
    },
    on(action: string, callback: (payload: unknown) => void) {
      alive()
      if (!listeners.has(action)) listeners.set(action, new Set())
      listeners.get(action)!.add(callback)
      return () => {
        listeners.get(action)?.delete(callback)
      }
    },
    trigger(action: string, payload?: unknown) {
      alive()
      for (const callback of listeners.get(action) ?? []) callback(payload)
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      listeners.clear()
      adapter.destroy()
    },
  }
}
export type ModelController = ReturnType<typeof bindModel>
