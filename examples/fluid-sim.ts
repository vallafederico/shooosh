/**
 * Stable Fluids pass loop — example-owned; sits on a createCompute session.
 *
 * How to use:
 *   const gpu = createCompute(engine)
 *   const fluid = createFluidSim(gpu!, { shaders: fluidShaders, simScale: 0.5 })
 *   fluid.splat({ x: 0.5, y: 0.5, dx: 40, dy: -10, color: [0.85, 1, 0.25], radius: 0.02 })
 *
 * Edit pass order / dissipation here. Edit WGSL in fluid-shaders.ts.
 * destroy() does not destroy the ComputeSession — caller owns that.
 */

import type { ComputePingPong, ComputeSession } from "shooosh"
import type { FluidShaders } from "./fluid-shaders"

export type FluidSplat = {
  x: number
  y: number
  dx: number
  dy: number
  color: [number, number, number]
  radius: number
}

export type FluidSimOptions = {
  shaders: FluidShaders
  /** Sim resolution vs canvas (0.25–1). Default 0.5. */
  simScale?: number
  dyeDissipation?: number
  velocityDissipation?: number
  /** Jacobi iterations. Default 20. */
  pressureIterations?: number
}

export type FluidSim = {
  splat: (s: FluidSplat) => void
  getSimSize: () => { width: number; height: number }
  destroy: () => void
}

const PARAMS_FLOATS = 16

function clampSimScale(value: number | undefined) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0.25, value as number))
}

export function createFluidSim(
  gpu: ComputeSession,
  options: FluidSimOptions,
): FluidSim | null {
  const shaders = options.shaders
  const simScale = clampSimScale(options.simScale)
  const dyeDissipation = options.dyeDissipation ?? 0.995
  const velocityDissipation = options.velocityDissipation ?? 0.98
  const pressureIterations = Math.max(4, Math.min(40, options.pressureIterations ?? 20))

  const canvas = gpu.canvas
  let simW = 0
  let simH = 0
  let velocity: ComputePingPong | null = null
  let dye: ComputePingPong | null = null
  let pressure: ComputePingPong | null = null
  let divergence: ReturnType<ComputeSession["createStorageTexture"]> | null = null
  let divergenceView: ReturnType<
    ReturnType<ComputeSession["createStorageTexture"]>["createView"]
  > | null = null

  const paramsBuffer = gpu.createUniformBuffer(PARAMS_FLOATS * 4, "fluid-params")
  const paramsData = new Float32Array(PARAMS_FLOATS)

  let advectPipe: ReturnType<ComputeSession["createPipeline"]>
  let splatPipe: ReturnType<ComputeSession["createPipeline"]>
  let divergencePipe: ReturnType<ComputeSession["createPipeline"]>
  let pressurePipe: ReturnType<ComputeSession["createPipeline"]>
  let gradientPipe: ReturnType<ComputeSession["createPipeline"]>
  let clearPipe: ReturnType<ComputeSession["createPipeline"]>
  let displayPipe: ReturnType<ComputeSession["createDisplayPipeline"]>
  let displayBindGroup: ReturnType<ComputeSession["device"]["createBindGroup"]> | null =
    null

  try {
    advectPipe = gpu.createPipeline(shaders.advect, "fluid-advect")
    splatPipe = gpu.createPipeline(shaders.splat, "fluid-splat")
    divergencePipe = gpu.createPipeline(shaders.divergence, "fluid-divergence")
    pressurePipe = gpu.createPipeline(shaders.pressure, "fluid-pressure")
    gradientPipe = gpu.createPipeline(shaders.gradient, "fluid-gradient")
    clearPipe = gpu.createPipeline(shaders.clear, "fluid-clear")
    displayPipe = gpu.createDisplayPipeline(shaders.display, "fluid-display")
  } catch (error) {
    console.warn("shooosh example: fluid pipelines failed:", error)
    paramsBuffer.destroy()
    return null
  }

  const destroySim = () => {
    velocity?.destroy()
    dye?.destroy()
    pressure?.destroy()
    divergence?.destroy()
    velocity = null
    dye = null
    pressure = null
    divergence = null
    divergenceView = null
    displayBindGroup = null
  }

  const pending: FluidSplat[] = []

  const clearTex = (
    encoder: Parameters<ComputeSession["dispatch"]>[0],
    view: NonNullable<typeof divergenceView>,
  ) => {
    gpu.dispatch(encoder, clearPipe, simW, simH, [{ binding: 0, resource: view }], "fluid-clear")
  }

  const ensureSim = (encoder: Parameters<ComputeSession["dispatch"]>[0]) => {
    if (canvas.width < 2 || canvas.height < 2) return false
    const nextW = Math.max(32, Math.round(canvas.width * simScale))
    const nextH = Math.max(32, Math.round(canvas.height * simScale))
    if (velocity && nextW === simW && nextH === simH) return true
    destroySim()
    simW = nextW
    simH = nextH
    velocity = gpu.createPingPong(simW, simH, "fluid-vel")
    dye = gpu.createPingPong(simW, simH, "fluid-dye")
    pressure = gpu.createPingPong(simW, simH, "fluid-pressure")
    divergence = gpu.createStorageTexture(simW, simH, "fluid-divergence")
    divergenceView = divergence.createView()
    clearTex(encoder, velocity.readView)
    clearTex(encoder, velocity.writeView)
    clearTex(encoder, dye.readView)
    clearTex(encoder, dye.writeView)
    clearTex(encoder, pressure.readView)
    clearTex(encoder, pressure.writeView)
    clearTex(encoder, divergenceView)
    return true
  }

  const setParams = (dt: number, dissipation: number) => {
    paramsData[0] = 1 / simW
    paramsData[1] = 1 / simH
    paramsData[2] = dt
    paramsData[3] = dissipation
  }

  const runSplat = (
    encoder: Parameters<ComputeSession["dispatch"]>[0],
    target: ComputePingPong,
    splat: FluidSplat,
    asVelocity: boolean,
  ) => {
    setParams(0, 1)
    paramsData[4] = splat.x
    paramsData[5] = splat.y
    paramsData[6] = splat.radius
    paramsData[7] = 0
    if (asVelocity) {
      paramsData[8] = splat.dx
      paramsData[9] = splat.dy
      paramsData[12] = 0
      paramsData[13] = 0
      paramsData[14] = 0
      paramsData[15] = 0
    } else {
      paramsData[8] = 0
      paramsData[9] = 0
      paramsData[12] = splat.color[0]
      paramsData[13] = splat.color[1]
      paramsData[14] = splat.color[2]
      paramsData[15] = 1
    }
    gpu.writeBuffer(paramsBuffer, paramsData)
    gpu.dispatch(encoder, splatPipe, simW, simH, [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: target.readView },
      { binding: 2, resource: target.writeView },
    ])
    target.swap()
  }

  gpu.setOnCompute(({ encoder, delta }) => {
    if (!ensureSim(encoder)) {
      gpu.requestFrame()
      return
    }
    if (!velocity || !dye || !pressure || !divergenceView) return

    const dt = Math.min(0.033, Math.max(0.008, (delta || 16) / 1000))

    while (pending.length) {
      const s = pending.shift()!
      runSplat(encoder, velocity, s, true)
      runSplat(encoder, dye, s, false)
    }

    setParams(dt, velocityDissipation)
    gpu.writeBuffer(paramsBuffer, paramsData)
    gpu.dispatch(encoder, advectPipe, simW, simH, [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: velocity.readView },
      { binding: 2, resource: velocity.readView },
      { binding: 3, resource: velocity.writeView },
    ])
    velocity.swap()

    gpu.dispatch(encoder, divergencePipe, simW, simH, [
      { binding: 0, resource: velocity.readView },
      { binding: 1, resource: divergenceView },
    ])

    clearTex(encoder, pressure.readView)
    for (let i = 0; i < pressureIterations; i++) {
      gpu.dispatch(encoder, pressurePipe, simW, simH, [
        { binding: 0, resource: pressure.readView },
        { binding: 1, resource: divergenceView },
        { binding: 2, resource: pressure.writeView },
      ])
      pressure.swap()
    }

    gpu.dispatch(encoder, gradientPipe, simW, simH, [
      { binding: 0, resource: velocity.readView },
      { binding: 1, resource: pressure.readView },
      { binding: 2, resource: velocity.writeView },
    ])
    velocity.swap()

    setParams(dt, dyeDissipation)
    gpu.writeBuffer(paramsBuffer, paramsData)
    gpu.dispatch(encoder, advectPipe, simW, simH, [
      { binding: 0, resource: { buffer: paramsBuffer } },
      { binding: 1, resource: dye.readView },
      { binding: 2, resource: velocity.readView },
      { binding: 3, resource: dye.writeView },
    ])
    dye.swap()

    displayBindGroup = gpu.device.createBindGroup({
      layout: displayPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: dye.readView }],
    })

    gpu.requestFrame()
  })

  gpu.setOnDisplay(({ pass }) => {
    if (!displayBindGroup) return
    pass.setPipeline(displayPipe)
    pass.setBindGroup(0, displayBindGroup)
    pass.draw(3)
  })

  return {
    splat(s) {
      pending.push(s)
      gpu.requestFrame()
    },
    getSimSize() {
      return { width: simW, height: simH }
    },
    destroy() {
      destroySim()
      paramsBuffer.destroy()
      displayBindGroup = null
      gpu.setOnCompute(null)
      gpu.setOnDisplay(null)
    },
  }
}
