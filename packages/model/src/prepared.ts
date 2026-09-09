import type { ModelManifest } from "./manifest.js"
/** Decoded rigid primitives: shared geometry, distinct node instances. */
export type PreparedModel = {
  version: 1
  manifest: ModelManifest
  binary: string
  binaryHash: string
  geometry: {
    mesh: number
    primitive: number
    material: number | null
    uvOffset?: number
    verticesOffset: number
    verticesCount: number
    indicesOffset: number
    indicesCount: number
  }[]
  textures?: {
    material: number
    offset: number
    length: number
    wrapS: number
    wrapT: number
  }[]
  limitations: string[]
}
