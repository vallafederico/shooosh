import shader, { fragment } from "./physics-lab.wgsl"
/**
 * Rapier → createObject bridge. Copy with physics-world.ts and types.ts.
 * Mount a canvas in a positioned parent. Native controls are owned and removed here.
 * value1 selects the palette. Body metres map to a fitted 12×12 view; rotations are radians.
 * 2D collisions, shallow 3D meshes; not a 3D physics demo. See physics.md.
 */
import { createObject, createCanvasScene as createScene } from "shooosh"
import { createPhysicsClock, createPhysicsWorld, loadRapier, type PhysicsMode } from "./physics-world"
import type { ExampleHandle, ExampleRunOptions } from "./types"

export { fragment }


export function runPhysics(canvas: HTMLCanvasElement, mode: PhysicsMode, options: ExampleRunOptions = {}): ExampleHandle {
  let disposed = false
  let simulation: ReturnType<typeof createPhysicsWorld> | undefined
  let visuals: ReturnType<typeof createObject>[] = []
  let unsubscribe: (() => void) | undefined
  let visible = true
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches
  const clock = createPhysicsClock()
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
    const rapier = await loadRapier()
    if (disposed) return null
    rebuild = () => {
      clearWorld()
      simulation = createPhysicsWorld(rapier, mode)
      visuals = simulation.shapes.map(({ body, width, height, fixed }, i) => {
        const placement = { centerX: 0, centerY: 0, scale: 1 }
        const camera = { fov: 90, distance: 6, far: 100 }
        return createObject(null, {
          shape: { type: "roundedBox", width, height, depth: 0.12, rounding: 0.04 },
          placement, camera, shaders: shader, uni: { value1: fixed ? 1 : (i % 4) / 5 },
          onFrame(self, frame) {
            const aspect = frame.canvas.width / Math.max(1, frame.canvas.height)
            camera.distance = Math.max(6, 6 / aspect)
            placement.scale = 1 / (0.4 * Math.min(aspect, 1 / aspect))
            const p = body.translation()
            placement.centerX = p.x / (camera.distance * aspect)
            placement.centerY = p.y / camera.distance
            self.setTransform({ rotationZ: body.rotation() })
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
      const message = sleeping ? "Sleeping · apply an impulse" : "60 Hz · Rapier 2D"
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
