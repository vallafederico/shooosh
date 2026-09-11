/**
 * DOM-tracked PBR spray can. Copy with studio-metal.wgsl.
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
import shader from "./studio-metal.wgsl"
import { modelFitScale } from "./lib/model-fit"

const BASE_ROTATION_X = 0.16
const BASE_ROTATION_Y = 0.42
const CAMERA = { enabled: true, distance: 2.8, fov: 32, near: 0.1, far: 20 }

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

  // A rotation-invariant bound avoids resizing the object as the user spins it.
  let radius = 0
  for (let i = 0; i < mesh.vertices.length; i += mesh.vertexStride) {
    radius = Math.max(radius, Math.hypot(mesh.vertices[i]!, mesh.vertices[i + 1]!, mesh.vertices[i + 2]!))
  }
  let fittedScale = 1
  const resize = () => {
    const box = plane.getBoundingClientRect()
    const canvas = options.engine.canvas.getBoundingClientRect()
    fittedScale = modelFitScale(radius, box.width, box.height, canvas.width, canvas.height, CAMERA.distance, CAMERA.fov)
    options.engine.requestFrame()
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(plane)
  observer.observe(options.engine.canvas)

  const object = createObject(plane, {
    shape: { type: "custom", ...mesh },
    camera: CAMERA,
    envMap: albedo.texture,
    maskMap: orm.texture,
    shaders: shader,
    scale: fittedScale,
    rotationX: BASE_ROTATION_X,
    rotationY: BASE_ROTATION_Y,
    onFrame(self, frame) {
      const rotation = spinner.update(frame.delta / 1000)
      const cursor = rotation.dragging ? "grabbing" : "grab"
      if (plane.style.cursor !== cursor) plane.style.cursor = cursor
      self.setTransform({
        scale: fittedScale,
        rotationX: BASE_ROTATION_X + rotation.x,
        rotationY: BASE_ROTATION_Y + rotation.y,
      })
    },
  })

  return () => {
    observer.disconnect()
    plane.removeEventListener("dblclick", reset)
    plane.style.touchAction = previousTouchAction
    plane.style.cursor = previousCursor
    spinner.destroy()
    object.destroy()
    albedo.destroy()
    orm.destroy()
  }
}
