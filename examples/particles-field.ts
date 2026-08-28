/**
 * Particles field — createParticles with animated clip-space positions.
 *
 * How to use:
 *   await scene.getInitPromise()
 *   const particles = createParticles({ positions, size: 8, color: [0.85, 1, 0.25, 1] })
 *   engine.onRender(() => particles.setPositions(next))
 *
 * WebGL2 draws POINTS; WebGPU draws instanced soft quads.
 */

import { createParticles, createScene } from "shooosh"
import type { ExampleHandle, ExampleRunOptions, ExampleSpec } from "./types"

const COUNT = 48

/** Stub for converter tests — live look is the particle disc, not a fullscreen fsMain. */
export const fragment = `fn fsMain() -> vec4f {
  return vec4f(0.047, 0.047, 0.043, 1.0);
}
`

function seedPositions(out: Float32Array, now: number) {
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2 + now * 0.35
    const r = 0.25 + 0.45 * ((i * 17) % 10) / 10
    const wobble = 0.08 * Math.sin(now * 1.4 + i)
    out[i * 2] = Math.cos(a) * r
    out[i * 2 + 1] = Math.sin(a * 1.15) * r * 0.72 + wobble
  }
}

export function run(canvas: HTMLCanvasElement, options: ExampleRunOptions = {}): ExampleHandle {
  let particles: ReturnType<typeof createParticles> | null = null
  let unsub: (() => void) | null = null
  const positions = new Float32Array(COUNT * 2)

  const scene = createScene(canvas, {
    backend: options.backend ?? "auto",
    dpr: { max: 1.5 },
    clearColor: { r: 0.047, g: 0.047, b: 0.043, a: 1 },
    onInitError: options.onInitError,
  })

  const ready = Promise.resolve(scene.getInitPromise() ?? Promise.resolve()).then(() => {
    const engine = scene.getEngine()
    if (!engine) return null
    seedPositions(positions, 0)
    particles = createParticles({
      positions,
      size: 10,
      color: [0.847, 1.0, 0.243, 1],
      layer: 5,
    })
    unsub = engine.onRender((frame) => {
      if (!particles) return
      seedPositions(positions, frame.now * 0.001)
      particles.setPositions(positions)
    })
    return engine.backend
  })

  return {
    destroy() {
      unsub?.()
      unsub = null
      particles?.destroy()
      particles = null
      scene.destroy()
    },
    ready,
  }
}

export const particlesField: ExampleSpec = {
  id: "particles-field",
  label: "Particles",
  copy: "createParticles + setPositions each frame. POINTS on WebGL2, quads on WebGPU.",
  fragment,
  run: (target, options) => run(target as HTMLCanvasElement, options),
}
