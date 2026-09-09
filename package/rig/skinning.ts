/** Optional palette/socket utilities. No mesh deformation or renderer ownership. */
import type { Rig } from "./rig"
import { affine, identity, inverse, multiply } from "./math"
/** Mesh-local palette: inverse(meshWorld) * jointWorld * inverseBind, glTF joint order. */
export function writeSkinMatrices(
  rig: Rig,
  skinRef: number | string,
  meshNode: number | string | null = null,
  out?: Float32Array,
): Float32Array {
  const matches =
    typeof skinRef === "number"
      ? [rig.skins[skinRef]].filter(Boolean)
      : rig.skins.filter((s) => s.key === skinRef)
  if (matches.length !== 1) throw new Error(`Unknown skin: ${skinRef}`)
  const skin = matches[0]
  const result = out ?? new Float32Array(skin.joints.length * 16)
  if (result.length !== skin.joints.length * 16)
    throw new Error("Incorrect palette output length")
  const meshInverse =
    meshNode === null ? identity() : inverse(rig.node(meshNode).worldMatrix())
  const values = skin.joints.flatMap((joint, i) =>
    multiply(
      multiply(meshInverse, rig.node(joint).worldMatrix()),
      skin.inverseBindMatrices.slice(i * 16, i * 16 + 16),
    ),
  )
  if (values.some((v) => !Number.isFinite(Math.fround(v))))
    throw new Error("Skin matrix exceeds float32 range")
  result.set(values)
  return result
}
/** Rig/model-space socket transform; multiply by the model placement in your renderer. */
export function getSocketMatrix(
  rig: Rig,
  bone: number | string,
  offset?: ArrayLike<number>,
  out: Float64Array = new Float64Array(16),
): Float64Array {
  if (out.length !== 16) throw new Error("Expected 16-element matrix output")
  out.set(multiply(rig.bone(bone).worldMatrix(), offset ? affine(offset) : identity()))
  return out
}
