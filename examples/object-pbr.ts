/**
 * PBR pipeline — three createObject rounded boxes sharing pbr-shaders.ts.
 *
 * How to use:
 *   import { pbrFragment } from "./pbr-shaders"
 *   const env = await loadTexture(makeEnvCanvas(), { flipY: false })
 *   createObject(null, {
 *     shape: { type: "roundedBox", … },
 *     envMap: env.texture,
 *     shaders: { fragment: pbrFragment },
 *     onFrame(self, frame) {
 *       self.setUni({ value1: t, value2: metal, value3: rough, value5, value6, value7 })
 *       self.setTransform({ rotationY: … })
 *     },
 *   })
 *
 * Slots left → right: painted dielectric, brushed metal, chrome / acid metal.
 */

import { createObject, createScene, loadTexture } from "shooosh"
import { makeEnvCanvas } from "./make-texture"
import { pbrFragment } from "./pbr-shaders"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = pbrFragment

type Material = {
  metallic: number
  roughness: number
  albedo: [number, number, number]
  centerX: number
}

const MATERIALS: Material[] = [
  { metallic: 0.0, roughness: 0.55, albedo: [0.925, 0.906, 0.863], centerX: -0.72 },
  { metallic: 0.9, roughness: 0.22, albedo: [0.78, 0.8, 0.84], centerX: 0 },
  { metallic: 1.0, roughness: 0.06, albedo: [0.847, 1.0, 0.243], centerX: 0.72 },
]

const SHAPE = {
  type: "roundedBox" as const,
  width: 0.85,
  height: 0.85,
  depth: 0.85,
  rounding: 0.16,
}

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  const objects: ReturnType<typeof createObject>[] = []

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(async () => {
    const engine = scene.getEngine()
    if (!engine) return null
    // flipY: false — matcap/env sample space must match WebGPU (no UNPACK flip).
    const env = await loadTexture(makeEnvCanvas(512), { flipY: false })

    for (const [index, mat] of MATERIALS.entries()) {
      const [ar, ag, ab] = mat.albedo
      objects.push(
        createObject(null, {
          shape: SHAPE,
          placement: { centerX: mat.centerX, centerY: 0.02, scale: 1.15 },
          envMap: env.texture,
          shaders: { fragment: pbrFragment },
          onFrame(self, frame) {
            const t = frame.now * 0.001
            self.setTransform({
              rotationY: t * 0.55 + index * 0.7,
              rotationX: 0.32 + Math.sin(t * 0.45 + index) * 0.12,
            })
            self.setUni({
              value1: t,
              value2: mat.metallic,
              value3: mat.roughness,
              value5: ar,
              value6: ag,
              value7: ab,
            })
          },
        }),
      )
    }

    return engine.backend
  })

  return {
    destroy() {
      for (const object of objects) object.destroy()
      objects.length = 0
      scene.destroy()
    },
    ready,
  }
}

export const objectPbr: ExampleSpec = {
  id: "object-pbr",
  label: "PBR materials",
  copy: "Cook–Torrance GGX + env IBL. Three metals/roughness slots via setUni. Both backends.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
