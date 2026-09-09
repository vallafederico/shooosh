/** Serializable rig data; node indices match the exact imported model artifact. */
export type RigTransform = {
  translation?: readonly number[]
  rotation?: readonly number[] // quaternion [x,y,z,w]
  scale?: readonly number[]
}
export type RigNode = RigTransform & {
  key?: string
  name?: string
  parent?: number | null
  mesh?: number | null
  skin?: number | null
  /** Static affine local matrix. Mutually exclusive with TRS. */
  matrix?: readonly number[]
}
export type RigSkin = {
  key?: string
  name?: string
  joints: readonly number[]
  /** Column-major MAT4 per joint, in joints order. Omitted means identities. */
  inverseBindMatrices?: readonly number[]
  skeleton?: number | null
}
export type RigTrack = {
  node: number
  path: "translation" | "rotation" | "scale"
  times: readonly number[]
  values: readonly number[]
  interpolation?: "STEP" | "LINEAR" | "CUBICSPLINE"
}
export type RigClip = { key?: string; name?: string; tracks: readonly RigTrack[] }
export type RigDefinition = {
  version: 1
  sourceHash?: string
  nodes: readonly RigNode[]
  skins?: readonly RigSkin[]
  clips?: readonly RigClip[]
  warnings?: readonly string[]
}
export type RigPose = readonly { node: number; transform: RigTransform }[]
