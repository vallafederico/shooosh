import type { Document } from "@gltf-transform/core"
/** Repair Assimp's numerical normalization errors without dropping rigs or animation. */
export function normalizeImportedTransforms(document: Document) {
  let rotations = 0,
    weights = 0
  const seen = new Set<unknown>()
  for (const animation of document.getRoot().listAnimations())
    for (const channel of animation.listChannels()) {
      if (channel.getTargetPath() !== "rotation") continue
      const sampler = channel.getSampler(),
        output = sampler?.getOutput()
      if (!output || seen.has(output)) continue
      seen.add(output)
      const step = sampler!.getInterpolation() === "CUBICSPLINE" ? 3 : 1
      for (let i = step === 3 ? 1 : 0; i < output.getCount(); i += step) {
        const value = output.getElement(i, [])
        const length = Math.hypot(...value)
        if (!Number.isFinite(length) || length < 1e-12)
          throw new Error("Imported animation contains a zero/nonfinite quaternion")
        if (Math.abs(length - 1) > 1e-6) {
          if (step === 3)
            throw new Error(
              "Cannot automatically repair a non-unit cubic animation quaternion",
            )
          output.setElement(
            i,
            value.map((n) => n / length),
          )
          rotations++
        }
      }
    }
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      const attributes = primitive
        .listSemantics()
        .filter((name) => /^WEIGHTS_\d+$/.test(name))
        .map((name) => primitive.getAttribute(name)!)
      if (!attributes.length) continue
      for (let i = 0; i < attributes[0].getCount(); i++) {
        const values = attributes.map((attribute) => attribute.getElement(i, []))
        const sum = values.flat().reduce((a, b) => a + b, 0)
        if (!Number.isFinite(sum) || sum <= 0)
          throw new Error("Imported vertex has zero/nonfinite skin weights")
        if (Math.abs(sum - 1) > 1e-7) {
          attributes.forEach((attribute, j) =>
            attribute.setElement(
              i,
              values[j].map((n) => n / sum),
            ),
          )
          weights++
        }
      }
    }
  return { rotations, weights }
}
