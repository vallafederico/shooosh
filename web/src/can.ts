/**
 * DOM-tracked PBR spray can. Copy with can.wgsl.
 *
 * How to use:
 *   await scene.init()
 *   const stop = await mountCan(plane, { engine })
 *   // teardown: stop()
 *
 * Expects /can/vertices.bin, indices.bin, albedo.webp, orm.png from
 * web/scripts/prepare-can.mjs. Drag on the plane uses shooosh/utility createSpinner.
 */
import { createObject, loadTexture, type WebGLEngine } from "shooosh"
import { createSpinner } from "shooosh/utility"
import shader from "./can.wgsl"

const BASE_ROTATION_X = 0.16
const BASE_ROTATION_Y = 0.42

async function loadMesh() {
  const [vertexRes, indexRes] = await Promise.all([
    fetch("/can/vertices.bin"),
    fetch("/can/indices.bin"),
  ])
  if (!vertexRes.ok || !indexRes.ok) {
    throw new Error("Can mesh binaries are missing. Run web/scripts/prepare-can.mjs.")
  }
  const [vertexBuf, indexBuf] = await Promise.all([vertexRes.arrayBuffer(), indexRes.arrayBuffer()])
  return {
    vertices: new Float32Array(vertexBuf),
    indices: new Uint32Array(indexBuf),
    vertexStride: 8 as const,
  }
}

export async function mountCan(
  plane: HTMLElement,
  options: { engine: WebGLEngine },
): Promise<() => void> {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  const previousTouchAction = plane.style.touchAction
  const previousCursor = plane.style.cursor
  plane.style.touchAction = "none"
  plane.style.cursor = "grab"
  const spinner = createSpinner({
    element: plane,
    inertia: !reducedMotion.matches,
  })
  const reset = () => spinner.reset()
  plane.addEventListener("dblclick", reset)

  const mesh = await loadMesh()
  const [albedo, orm] = await Promise.all([
    loadTexture("/can/albedo.webp", {
      engine: options.engine,
      flipY: false,
      sampler: { minFilter: "linear", magFilter: "linear" },
    }),
    loadTexture("/can/orm.png", {
      engine: options.engine,
      data: true,
      flipY: false,
      sampler: { minFilter: "linear", magFilter: "linear" },
    }),
  ])

  const object = createObject(plane, {
    shape: { type: "custom", ...mesh },
    camera: { enabled: true, distance: 2.8, fov: 32, near: 0.1, far: 20 },
    envMap: albedo.texture,
    maskMap: orm.texture,
    shaders: shader,
    scale: 1.85,
    rotationX: BASE_ROTATION_X,
    rotationY: BASE_ROTATION_Y,
    onFrame(self, frame) {
      const rotation = spinner.update(frame.delta / 1000)
      const cursor = rotation.dragging ? "grabbing" : "grab"
      if (plane.style.cursor !== cursor) plane.style.cursor = cursor
      self.setTransform({
        rotationX: BASE_ROTATION_X + rotation.x,
        rotationY: BASE_ROTATION_Y + rotation.y,
      })
    },
  })

  return () => {
    plane.removeEventListener("dblclick", reset)
    plane.style.touchAction = previousTouchAction
    plane.style.cursor = previousCursor
    spinner.destroy()
    object.destroy()
    albedo.destroy()
    orm.destroy()
  }
}
