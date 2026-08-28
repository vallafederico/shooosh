/**
 * Fluid pointer — createCompute + example fluid-sim / fluid-shaders.
 *
 * How to use:
 *   import { createScene, createCompute } from "shooosh"
 *   import { createFluidSim } from "./fluid-sim"
 *   import { fluidShaders } from "./fluid-shaders"
 *   const gpu = createCompute(engine)
 *   const fluid = createFluidSim(gpu!, { shaders: fluidShaders, simScale: 0.5 })
 *   // pointermove → fluid.splat(...); idle drip via onRender
 *
 * Requires WebGPU. Edit WGSL in fluid-shaders.ts; pass loop in fluid-sim.ts.
 */

import { createCompute, createScene, type ComputeSession } from "shooosh"
import { createFluidSim, type FluidSim } from "./fluid-sim"
import { fluidShaders } from "./fluid-shaders"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

/** Stub for converter tests — live display is the compute dye blit. */
export const fragment = `fn fsMain() -> vec4f {
  return vec4f(0.047, 0.047, 0.043, 1.0);
}
`

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  let gpu: ComputeSession | null = null
  let fluid: FluidSim | null = null
  let unsubIdle: (() => void) | null = null
  let lastPointer: { x: number; y: number } | null = null

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const uvFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1)
    const y = (event.clientY - rect.top) / Math.max(rect.height, 1)
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
  }

  const onPointerDown = (event: PointerEvent) => {
    lastPointer = uvFromEvent(event)
    canvas.setPointerCapture?.(event.pointerId)
  }
  const onPointerUp = () => {
    lastPointer = null
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!fluid) return
    const uv = uvFromEvent(event)
    if (!lastPointer) {
      lastPointer = uv
      return
    }
    const { width: simW, height: simH } = fluid.getSimSize()
    if (simW < 1 || simH < 1) {
      lastPointer = uv
      return
    }
    const dx = (uv.x - lastPointer.x) * simW
    const dy = (uv.y - lastPointer.y) * simH
    lastPointer = uv
    if (Math.abs(dx) + Math.abs(dy) < 0.02) return
    const hue = (performance.now() * 0.0002) % 1
    fluid.splat({
      x: uv.x,
      y: uv.y,
      dx: dx * 8,
      dy: dy * 8,
      color: [
        0.4 + 0.6 * Math.sin(hue * Math.PI * 2),
        0.85,
        0.3 + 0.5 * Math.cos(hue * Math.PI * 2),
      ],
      radius: 0.012,
    })
  }

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(() => {
    const engine = scene.getEngine()
    if (!engine) return null
    if (engine.backend !== "webgpu") {
      console.warn("shooosh example: fluid-pointer needs WebGPU; showing clear color only.")
      return engine.backend
    }

    gpu = createCompute(engine)
    if (!gpu) return engine.backend

    fluid = createFluidSim(gpu, {
      simScale: 0.5,
      shaders: fluidShaders,
    })
    if (!fluid) {
      gpu.destroy()
      gpu = null
      return engine.backend
    }

    fluid.splat({
      x: 0.5,
      y: 0.5,
      dx: 40,
      dy: -12,
      color: [0.85, 1.0, 0.25],
      radius: 0.02,
    })

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointercancel", onPointerUp)
    canvas.addEventListener("pointermove", onPointerMove)

    unsubIdle = engine.onRender((frame) => {
      if (!fluid) return
      const { width: simW, height: simH } = fluid.getSimSize()
      if (simW < 1 || simH < 1) return
      const t = frame.now * 0.001
      fluid.splat({
        x: 0.5 + Math.cos(t * 0.45) * 0.1,
        y: 0.5 + Math.sin(t * 0.4) * 0.08,
        dx: Math.cos(t * 0.9) * simW * 0.1,
        dy: Math.sin(t * 0.85) * simH * 0.1,
        color: [0.75, 0.95, 0.3],
        radius: 0.013,
      })
    })

    return engine.backend
  })

  return {
    destroy() {
      unsubIdle?.()
      unsubIdle = null
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointercancel", onPointerUp)
      canvas.removeEventListener("pointermove", onPointerMove)
      fluid?.destroy()
      fluid = null
      gpu?.destroy()
      gpu = null
      scene.destroy()
    },
    ready,
  }
}

export const fluidPointer: ExampleSpec = {
  id: "fluid-pointer",
  label: "Fluid pointer",
  copy: "createCompute + fluid-sim / fluid-shaders; pointer splat. WebGPU.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
