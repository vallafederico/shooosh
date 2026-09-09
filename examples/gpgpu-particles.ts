/** 65,536 particles integrated by WGSL compute, then drawn from the same storage buffer.
 * Copy this file, gpgpu-particles-shaders.ts, both gpgpu-webgl modules and types.ts.
 * Mount into a sized HTMLElement.
 * WebGPU compute with a dynamically loaded WebGL2 transform-feedback fallback.
 */
import { createCanvasScene, createCompute, type ComputeSession } from "shooosh"
import { computeShader, displayShader } from "./gpgpu-particles-shaders"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

export const fragment = `fn fsMain() -> vec4f { return vec4f(0.025, 0.035, 0.05, 1.0); }`

export type ParticleSimulation = {
  compute: string; display: string; shadow?: string; title: string; description: string;
  height: number; stride: number; depth?: boolean; webgl: "field" | "sphere";
}

/** Shared example-owned lifecycle; shaders and particle layout remain configurable. */
export function runParticleSimulation(target: HTMLElement, options: ExampleRunOptions, config: ParticleSimulation): ExampleHandle {
  const count = 256 * config.height
  const root = document.createElement("section")
  root.style.cssText = "position:relative;width:100%;height:100%;min-height:420px;background:#06090d;color:#d5eee8;overflow:hidden"
  const canvas = document.createElement("canvas")
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none"
  canvas.setAttribute("aria-label", config.title + ". Move the pointer or drag a finger to disturb it.")
  const panel = document.createElement("div")
  panel.style.cssText = "position:absolute;left:24px;top:24px;right:24px;pointer-events:none;font:12px/1.6 ui-monospace,monospace"
  const title = document.createElement("h2")
  title.textContent = config.title
  title.style.cssText = "font-size:18px;margin:0 0 6px"
  const status = document.createElement("p")
  status.textContent = "Starting GPU simulation…"
  const controls = document.createElement("div")
  controls.style.cssText = "display:flex;gap:8px;pointer-events:auto;width:fit-content"
  const pause = document.createElement("button")
  const reset = document.createElement("button")
  for (const button of [pause, reset]) {
    button.type = "button"
    button.disabled = true
    button.style.cssText = "background:#12212a;color:#d5eee8;border:1px solid #38505a;padding:8px 12px;border-radius:5px;cursor:pointer"
  }
  reset.textContent = "Reset"
  let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches
  pause.textContent = playing ? "Pause" : "Play"
  controls.append(pause, reset)
  let shadows = true
  const shadowToggle = document.createElement("button")
  if (config.shadow) {
    shadowToggle.type = "button"; shadowToggle.disabled = true
    shadowToggle.style.cssText = pause.style.cssText
    shadowToggle.textContent = "Shadows on"
    shadowToggle.setAttribute("aria-pressed", "true")
    controls.append(shadowToggle)
  }
  panel.append(title, status, controls)
  root.append(canvas, panel)
  target.append(root)
  let disposed = false, visible = true, initialize = true, time = 0
  let pointerX = 0.5, pointerY = 0.5, active = false
  let gpu: ComputeSession | null = null
  let releaseWebgl: (() => void) | undefined
  let releaseBuffers: (() => void) | undefined
  const events = new AbortController()
  const scene = createCanvasScene(canvas, {
    backend: options.backend ?? "auto", dpr: { max: 1.5 },
    clearColor: { r: 0.025, g: 0.035, b: 0.05, a: 1 },
  })
  canvas.addEventListener("webglcontextlost", () => {
    playing = false
    pause.disabled = reset.disabled = shadowToggle.disabled = true
    status.textContent = "Graphics context lost. Switch backend or reopen this example to restart."
  }, { signal: events.signal })
  const wake = () => { if (!disposed) scene.getEngine()?.requestFrame() }
  const observe = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake() })
  observe.observe(root)
  document.addEventListener("visibilitychange", () => { active = false; if (!document.hidden) wake() }, { signal: events.signal })
  const pointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    pointerX = (event.clientX - rect.left) / Math.max(1, rect.width)
    pointerY = (event.clientY - rect.top) / Math.max(1, rect.height)
    active = true
    wake()
  }
  canvas.addEventListener("pointermove", pointer, { signal: events.signal })
  canvas.addEventListener("pointerdown", event => { pointer(event); canvas.setPointerCapture(event.pointerId) }, { signal: events.signal })
  for (const name of ["pointerleave", "pointercancel", "pointerup", "lostpointercapture"]) {
    canvas.addEventListener(name, () => { active = false }, { signal: events.signal })
  }
  pause.addEventListener("click", () => { playing = !playing; pause.textContent = playing ? "Pause" : "Play"; wake() }, { signal: events.signal })
  shadowToggle.addEventListener("click", () => {
    shadows = !shadows
    shadowToggle.textContent = shadows ? "Shadows on" : "Shadows off"
    shadowToggle.setAttribute("aria-pressed", String(shadows))
    wake()
  }, { signal: events.signal })
  reset.addEventListener("click", () => { initialize = true; time = 0; active = false; wake() }, { signal: events.signal })
  const ready = Promise.resolve(scene.getInitPromise()).then(async () => {
    if (disposed) return null
    const engine = scene.getEngine()
    if (!engine) throw new Error("No GPU backend is available.")
    if (engine.backend !== "webgpu") {
      const { createWebglParticles } = await import("./gpgpu-webgl")
      if (disposed) return null
      if (!engine.gl) throw new Error("WebGL2 context is unavailable")
      const simulation = createWebglParticles(engine.gl, config.webgl === "sphere")
      const values = new Float32Array(12)
      let failed = false
      const unsubscribe = engine.onRender(({ delta }) => {
        if (failed) return
        const running = playing && visible && !document.hidden
        const dt = running ? Math.min(1 / 30, Math.max(0, delta / 1000)) : 0
        time += dt
        const aspect = canvas.width / Math.max(1, canvas.height)
        values.set([dt, time, aspect, initialize ? 1 : 0, (pointerX * 2 - 1) * aspect, 1 - pointerY * 2, active ? 1 : 0, 0.32, canvas.width, canvas.height, Math.max(1, canvas.height / 650), shadows ? 0 : 1])
        try { simulation.render(values, running) }
        catch (error) {
          failed = true
          status.textContent = error instanceof Error ? error.message : "WebGL2 particle simulation failed"
          pause.disabled = reset.disabled = shadowToggle.disabled = true
          options.onInitError?.(error)
          return
        }
        initialize = false
        if (running) engine.requestFrame()
      })
      releaseWebgl = () => { unsubscribe(); simulation.destroy() }
      status.textContent = `${simulation.count.toLocaleString("en-US")} particles · WebGL2 GPGPU fallback · move your mouse or drag to stir`
      pause.disabled = reset.disabled = shadowToggle.disabled = false
      engine.requestFrame()
      return engine.backend
    }
    gpu = createCompute(engine)
    if (!gpu) throw new Error("WebGPU compute is unavailable.")
    const session = gpu
    // Standard GPUBufferUsage.STORAGE | COPY_DST; structural public device API.
    const state = session.device.createBuffer({ size: count * config.stride, usage: 0x80 | 0x08, label: "particle positions and velocities" })
    const uniform = session.createUniformBuffer(48, "particle controls")
    releaseBuffers = () => { state.destroy(); uniform.destroy() }
    const compute = session.createPipeline(config.compute, "particle integration")
    const display = config.depth ? (() => {
      const module = session.device.createShaderModule({ code: config.display, label: "sphere particles" })
      return session.device.createRenderPipeline({
        layout: "auto", vertex: { module, entryPoint: "vsMain" },
        fragment: { module, entryPoint: "fsMain", targets: [{ format: session.format }] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
      })
    })() : session.createDisplayPipeline(config.display, "particle instances")
    const entries = [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: state } }]
    const computeGroup = session.device.createBindGroup({ layout: compute.getBindGroupLayout(0), entries })
    const shadow = config.shadow ? (() => {
      const texture = session.device.createTexture({ size: { width: 1024, height: 1024 }, format: "depth24plus", usage: 0x10 | 0x04, label: "particle shadow map" })
      const priorRelease = releaseBuffers
      releaseBuffers = () => { texture.destroy(); priorRelease?.() }
      const view = texture.createView()
      const module = session.device.createShaderModule({ code: config.shadow, label: "particle light pass" })
      const pipeline = session.device.createRenderPipeline({
        layout: "auto", vertex: { module, entryPoint: "vsMain" },
        fragment: { module, entryPoint: "fsMain", targets: [] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
      })
      const group = session.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries })
      return { view, pipeline, group }
    })() : null
    const displayGroup = session.device.createBindGroup({ layout: display.getBindGroupLayout(0), entries: shadow ? [...entries, { binding: 2, resource: shadow.view }] : entries })
    const values = new Float32Array(12)
    session.setOnCompute(({ encoder, delta }) => {
      const running = playing && visible && !document.hidden
      const dt = running ? Math.min(1 / 30, Math.max(0, delta / 1000)) : 0
      time += dt
      const aspect = canvas.width / Math.max(1, canvas.height)
      values.set([dt, time, aspect, initialize ? 1 : 0, (pointerX * 2 - 1) * aspect, 1 - pointerY * 2, active ? 1 : 0, 0.32, canvas.width, canvas.height, Math.max(1, canvas.height / 650), shadows ? 0 : 1])
      session.writeBuffer(uniform, values)
      if (running || initialize) session.dispatch(encoder, compute, 256, config.height, computeGroup)
      if (shadow && shadows) {
        const pass = encoder.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: shadow.view, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" }, label: "particle self shadows" })
        pass.setPipeline(shadow.pipeline); pass.setBindGroup(0, shadow.group); pass.draw(6, count); pass.end()
      }
      initialize = false
      if (running) session.requestFrame()
    })
    session.setOnDisplay(({ pass }) => {
      pass.setPipeline(display)
      pass.setBindGroup(0, displayGroup)
      pass.draw(6, count)
    })
    status.textContent = config.description
    pause.disabled = reset.disabled = shadowToggle.disabled = false
    return engine.backend
  }).catch(error => {
    if (!disposed) {
      gpu?.destroy(); releaseWebgl?.(); releaseBuffers?.(); releaseBuffers = undefined
      scene.destroy()
      status.textContent = error instanceof Error ? error.message : "Could not start the particle simulation."
      options.onInitError?.(error)
    }
    return null
  })
  return { ready, getEngine: () => scene.getEngine(), destroy() {
    if (disposed) return
    disposed = true
    events.abort(); observe.disconnect(); gpu?.destroy(); releaseWebgl?.(); releaseBuffers?.(); scene.destroy(); root.remove()
  } }
}
export function run(target: HTMLElement, options: ExampleRunOptions = {}): ExampleHandle {
  return runParticleSimulation(target, options, {
    compute: computeShader, display: displayShader, height: 256, stride: 16, webgl: "field",
    title: "GPGPU / particle field",
    description: "65,536 particles · move your mouse or drag to stir · springs restore the field",
  })
}
export const gpgpuParticles: ExampleSpec = {
  id: "gpgpu-particles", label: "GPGPU · mouse particles", kind: "view", fragment,
  copy: "65,536 GPU particles with compute integration, mouse repulsion and a restoring spring. WebGPU compute / WebGL2 GPGPU.", run,
}
