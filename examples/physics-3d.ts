import shader, { fragment } from "./physics-3d.wgsl"
/** True 3D rigid bodies → world-space mesh transforms. Copy set and limits: physics.md. */
import { multiplyQuaternions, rotateVector3, poseToTransform } from "shooosh/utils"
import { createObject, createCanvasScene as createScene } from "shooosh"
import { createPhysicsClock } from "./physics-clock"
import { createPhysics3DWorld, loadRapier3D } from "./physics-3d-world"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export { fragment }


export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  let disposed = false
  let simulation: ReturnType<typeof createPhysics3DWorld> | undefined
  let visuals: ReturnType<typeof createObject>[] = []
  let unsubscribe: (() => void) | undefined
  let visible = true
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches
  const clock = createPhysicsClock()
  // View = X(pitch) * Y(yaw). Scratch outputs belong to this mount.
  const view = multiplyQuaternions(
    { x: Math.sin(0.55 / 2), y: 0, z: 0, w: Math.cos(0.55 / 2) },
    { x: 0, y: Math.sin(-0.45 / 2), z: 0, w: Math.cos(-0.45 / 2) },
  )
  const position = { x: 0, y: 0, z: 0 }
  const rotation = { x: 0, y: 0, z: 0, w: 1 }
  const transform = { positionX: 0, positionY: 0, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0 }
  const controls = document.createElement("div")
  controls.style.cssText = "position:absolute;top:24px;right:24px;left:24px;justify-content:flex-end;z-index:4;display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#ede8dc;font:13px system-ui"
  const status = document.createElement("span")
  status.setAttribute("role", "status")
  status.textContent = "Loading physics…"
  function button(label: string, action: () => void) {
    const el = document.createElement("button")
    el.type = "button"; el.textContent = label; el.disabled = true
    el.style.cssText = "font:inherit;padding:10px 16px;border:1px solid #74786a;border-radius:24px;color:#eee;background:#252821;cursor:pointer"
    el.addEventListener("click", action); controls.append(el)
    return el
  }
  const scene = createScene(canvas, { backend: options.backend ?? "auto", dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 } })
  const wake = () => { clock.reset(); scene.getEngine()?.requestFrame() }
  const pause = button(paused ? "Play" : "Pause", () => {
    paused = !paused; pause.textContent = paused ? "Play" : "Pause"; wake()
  })
  const kick = button("Apply impulse", () => { simulation?.kick(); wake() })
  let rebuild: (() => void) | undefined
  const reset = button("Reset", () => { rebuild?.(); wake() })
  controls.append(status); canvas.parentElement?.append(controls)
  const visibility = () => wake()
  document.addEventListener("visibilitychange", visibility)
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake() })
  observer.observe(canvas)
  function clearWorld() {
    visuals.forEach(object => object.destroy()); visuals = []
    simulation?.destroy(); simulation = undefined
  }
  const ready = (async () => {
    await scene.getInitPromise()
    if (disposed) return null
    const engine = scene.getEngine()
    if (!engine) throw new Error("No GPU renderer available")
    const rapier = await loadRapier3D()
    if (disposed) return null
    rebuild = () => {
      clearWorld()
      simulation = createPhysics3DWorld(rapier)
      visuals = simulation.shapes.map(({ body, width, height, depth, fixed }, i) => {
        const placement = { centerX: 0, centerY: 0, scale: 1 }
        const camera = { fov: 45, distance: 14, far: 100 }
        return createObject(null, {
          shape: { type: "roundedBox", width, height, depth, rounding: 0.04 },
          placement, camera, shaders: shader, uni: { value1: fixed ? 1 : (i % 4) / 5 },
          onFrame(self, frame) {
            const aspect = frame.canvas.width / Math.max(1, frame.canvas.height)
            camera.distance = Math.max(14, 12 / aspect)
            placement.scale = 1 / (0.4 * Math.min(aspect, 1 / aspect))
            rotateVector3(body.translation(), view, position)
            multiplyQuaternions(view, body.rotation(), rotation)
            self.setTransform(poseToTransform(position, rotation, transform))
          },
        })
      })
    }
    rebuild()
    for (const button of [pause, kick, reset]) button.disabled = false
    unsubscribe = engine.onRender(frame => {
      if (!simulation) return
      if (paused || !visible || document.hidden) { clock.reset(); if (status.textContent !== "Paused") status.textContent = "Paused"; return }
      clock.advance(frame.now, () => simulation!.world.step())
      const sleeping = simulation.sleeping()
      const message = sleeping ? "Sleeping · apply an impulse" : "60 Hz · Rapier 3D"
      if (status.textContent !== message) status.textContent = message
      if (!sleeping) engine.requestFrame()
    }, { layer: -100 })
    wake()
    return engine.backend
  })().catch(error => {
    if (!disposed) {
      clearWorld(); scene.destroy(); status.textContent = "Physics unavailable — see console"
      options.onInitError?.(error); console.error("Rapier example initialization failed", error)
    }
    return null
  })
  return { ready, getEngine: () => scene.getEngine(), destroy() {
    if (disposed) return
    disposed = true; unsubscribe?.(); observer.disconnect()
    document.removeEventListener("visibilitychange", visibility)
    controls.remove(); clearWorld(); scene.destroy()
  } }
}

export const physics3D: ExampleSpec = {
  id: "physics-3d", label: "Physics · 3D tumbling cubes", fragment,
  copy: "Rapier 3D bodies, collisions and torque in a tray. Pause, reset or launch the cubes. Both backends.",
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
