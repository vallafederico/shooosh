/**
 * Fabric material comparison: diffuse / sheen / sheen + coat, identical meshes.
 * Copy this file, materials/{fabric,sheen,clearcoat}.ts and types.ts.
 * run(canvas) adds native slider controls to the canvas parent; destroy removes
 * them and GPU resources. Static until controls change; no textures or frame loop.
 * See fabric-sheen.md for slots, composition, limits and verification.
 */
import { createObject, createCanvasScene as createScene } from "shooosh"
import diffuseShader, { fragment as diffuseFragment } from "./fabric-diffuse.wgsl"
import sheenShader, { fragment as sheenFragment } from "./fabric-sheen.wgsl"
import coatShader, { fragment } from "./fabric-coat.wgsl"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"
export { diffuseFragment, sheenFragment, fragment }

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  const objects: ReturnType<typeof createObject>[] = []
  let destroyed = false
  const uni = { value1: 0.65, value2: 1, value3: 1, value4: 0.25, value5: 0.55, value6: -0.7 }
  const controls = document.createElement("div")
  controls.style.cssText = "position:absolute;top:24px;left:5%;right:5%;z-index:3;padding:16px;background:#17191eee;color:#eee;border:1px solid #42444a;font:12px system-ui;border-radius:12px"
  const labels = document.createElement("p")
  labels.textContent = "Left: diffuse · Centre: + sheen · Right: + sheen + clearcoat"
  controls.append(labels)
  const inputs: HTMLInputElement[] = []
  const parameters: Array<[keyof typeof uni, string, number, number]> = [
    ["value1", "Sheen roughness", 0.12, 1], ["value2", "Sheen strength", 0, 2],
    ["value3", "Clearcoat strength", 0, 1], ["value4", "Coat roughness", 0.1, 0.8],
    ["value5", "Weave detail", 0, 1], ["value6", "Light angle", -2.5, 2.5],
  ]
  for (const [key, title, min, max] of parameters) {
    const label = document.createElement("label")
    label.style.cssText = "display:inline-flex;flex-direction:column;gap:6px;margin:6px 12px 0 0;width:130px"
    const text = document.createElement("span")
    text.textContent = title
    const input = document.createElement("input")
    input.type = "range"; input.min = String(min); input.max = String(max); input.step = "0.01"; input.value = String(uni[key]); input.disabled = true
    input.addEventListener("input", () => {
      uni[key] = Number(input.value)
      objects.forEach(object => object.setUni(uni))
    })
    inputs.push(input); label.append(text, input); controls.append(label)
  }
  canvas.parentElement?.append(controls)
  const scene = createScene(canvas, { backend: options.backend ?? "auto", dpr: { max: 1.5 },
    clearColor: { r: 0.045, g: 0.05, b: 0.065, a: 1 }, onInitError: options.onInitError })
  const ready = Promise.resolve(scene.getInitPromise()).then(() => {
    if (destroyed) return null
    const engine = scene.getEngine()
    if (!engine) return null
    for (const [index, material] of [diffuseShader, sheenShader, coatShader].entries()) {
      objects.push(createObject(null, {
        shape: { type: "roundedBox", width: 0.85, height: 0.85, depth: 0.85, rounding: 0.25 },
        placement: { centerX: (index - 1) * 0.72, centerY: 0.16, scale: 1.7 },
        rotationX: 0.3, rotationY: -0.35,
        shaders: material, uni: { ...uni },
      }))
    }
    inputs.forEach(input => { input.disabled = false })
    return engine.backend
  })
  return { ready, getEngine: () => scene.getEngine(), destroy() {
    if (destroyed) return
    destroyed = true; controls.remove(); objects.forEach(object => object.destroy()); objects.length = 0; scene.destroy()
  } }
}
export const fabricSheen: ExampleSpec = { id: "fabric-sheen", status: "wip", label: "Fabric / sheen",
  copy: "Identical static meshes: diffuse, tinted fabric sheen, and clearcoat. Native controls; no cloth simulation.",
  fragment, run: (target, options) => run(target as HTMLCanvasElement, options) }
