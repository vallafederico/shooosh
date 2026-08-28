/**
 * Fluid ambient — createCompute + example fluid-sim / fluid-shaders.
 *
 * How to use:
 *   import { createScene, createCompute } from "shooosh"
 *   import { createFluidSim } from "./fluid-sim"
 *   import { fluidShaders } from "./fluid-shaders"
 *   const gpu = createCompute(engine)
 *   const fluid = createFluidSim(gpu!, { shaders: fluidShaders, simScale: 0.5 })
 *   engine.onRender((frame) => fluid.splat(...))
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
  let unsubAmbient: (() => void) | null = null

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(() => {
    const engine = scene.getEngine()
    if (!engine) return null
    if (engine.backend !== "webgpu") {
      console.warn("shooosh example: fluid-ambient needs WebGPU; showing clear color only.")
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

    unsubAmbient = engine.onRender((frame) => {
      if (!fluid) return
      const { width: simW, height: simH } = fluid.getSimSize()
      if (simW < 1 || simH < 1) return
      const t = frame.now * 0.001
      const ax = 0.5 + Math.cos(t * 0.7) * 0.28
      const ay = 0.5 + Math.sin(t * 0.9) * 0.28
      const fx = Math.cos(t * 1.3) * simW * 0.35
      const fy = Math.sin(t * 1.1) * simH * 0.35
      fluid.splat({
        x: ax,
        y: ay,
        dx: fx,
        dy: fy,
        color: [
          0.55 + 0.45 * Math.sin(t),
          0.9,
          0.35 + 0.4 * Math.cos(t * 0.8),
        ],
        radius: 0.014,
      })
      const bx = 0.5 + Math.sin(t * 0.55) * 0.32
      const by = 0.5 + Math.cos(t * 0.65) * 0.22
      fluid.splat({
        x: bx,
        y: by,
        dx: -fy * 0.55,
        dy: fx * 0.55,
        color: [0.85, 1.0, 0.25],
        radius: 0.011,
      })
    })

    return engine.backend
  })

  return {
    destroy() {
      unsubAmbient?.()
      unsubAmbient = null
      fluid?.destroy()
      fluid = null
      gpu?.destroy()
      gpu = null
      scene.destroy()
    },
    ready,
  }
}

export const fluidAmbient: ExampleSpec = {
  id: "fluid-ambient",
  label: "Fluid ambient",
  copy: "createCompute + fluid-sim / fluid-shaders; ambient splat. WebGPU.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
