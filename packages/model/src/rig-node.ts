/** Node-only extraction of renderer-independent bone/animation data. */
import { writeFile } from "node:fs/promises"
import type { RigDefinition, RigTrack } from "shooosh/rig"
import { openModel, readMetadata, hashFile } from "./node.js"
import { partKey } from "./manifest.js"
export async function prepareRig(input: string): Promise<RigDefinition> {
  const metadata = await readMetadata(input)
  const { document } = await openModel(input)
  const root = document.getRoot(),
    nodes = root.listNodes()
  const ids = new Map(nodes.map((n, i) => [n, i]))
  const warnings: string[] = []
  const definition: RigDefinition = {
    version: 1,
    sourceHash: await hashFile(input),
    nodes: nodes.map((node, id) => ({
      key: partKey(node.getName(), "node", id),
      name: node.getName(),
      mesh: metadata.nodes?.[id]?.mesh ?? null,
      skin: metadata.nodes?.[id]?.skin ?? null,
      parent: node.getParentNode() ? ids.get(node.getParentNode()!)! : null,
      ...(metadata.nodes?.[id]?.matrix
        ? { matrix: metadata.nodes[id].matrix!.slice() }
        : {
            translation: node.getTranslation(),
            rotation: node.getRotation(),
            scale: node.getScale(),
          }),
    })),
    skins: root.listSkins().map((skin, id) => {
      const joints = skin.listJoints().map((n) => ids.get(n)!)
      const accessor = skin.getInverseBindMatrices()
      if (
        accessor &&
        (accessor.getType() !== "MAT4" || accessor.getCount() < joints.length)
      )
        throw new Error("Invalid inverse bind accessor")
      return {
        key: partKey(skin.getName(), "skin", id),
        name: skin.getName(),
        joints,
        skeleton: skin.getSkeleton() ? ids.get(skin.getSkeleton()!)! : null,
        ...(accessor
          ? {
              inverseBindMatrices: Array.from(accessor.getArray()!).slice(
                0,
                joints.length * 16,
              ),
            }
          : {}),
      }
    }),
    clips: root.listAnimations().map((clip, id) => {
      const tracks: RigTrack[] = []
      for (const channel of clip.listChannels()) {
        const path = channel.getTargetPath(),
          node = channel.getTargetNode(),
          sampler = channel.getSampler()
        if (!node || !path || !["translation", "rotation", "scale"].includes(path)) {
          warnings.push(
            `Clip ${id}: omitted ${path ?? "extension"} channel; rig utilities sample local TRS only.`,
          )
          continue
        }
        const input = sampler?.getInput(),
          output = sampler?.getOutput()
        if (
          !input ||
          !output ||
          input.getType() !== "SCALAR" ||
          output.getType() !== (path === "rotation" ? "VEC4" : "VEC3")
        )
          throw new Error("Invalid animation accessors")
        const values: number[] = []
        const element: number[] = []
        for (let i = 0; i < output.getCount(); i++) {
          output.getElement(i, element)
          for (const value of element) values.push(value)
        }
        tracks.push({
          node: ids.get(node)!,
          path: path as RigTrack["path"],
          interpolation: sampler!.getInterpolation(),
          times: Array.from({ length: input.getCount() }, (_, i) => input.getScalar(i)),
          values,
        })
      }
      return {
        key: partKey(clip.getName(), "animation", id),
        name: clip.getName(),
        tracks,
      }
    }),
    warnings,
  }
  // Fail before emitting malformed portable data. These dependencies stay on Node.
  const { createRig, createRigAnimator } = await import("shooosh/rig")
  createRigAnimator(createRig(definition), definition.clips ?? [])
  return definition
}
export async function generateRig(input: string, output: string) {
  const definition = await prepareRig(input)
  await writeFile(output, JSON.stringify(definition) + "\n", { flag: "wx" })
  return {
    output,
    nodes: definition.nodes.length,
    skins: definition.skins?.length ?? 0,
    clips: definition.clips?.length ?? 0,
    warnings: definition.warnings,
  }
}
