/**
 * Internal WebGPU hooks for createCompute. Not a public import.
 *
 * How to use: webgpu-engine registers; createCompute reads via getGpuInternals.
 * Stored on the engine object (Symbol) so Vite HMR / dual module graphs cannot
 * lose the WeakMap entry. Do not export from package/index.ts.
 */

import type { WebGLEngine } from "./engine";
import type { GpuCommandEncoder, GpuDevice } from "./gpu-api";

export type GpuPreRenderContext = {
  device: GpuDevice;
  encoder: GpuCommandEncoder;
  canvas: HTMLCanvasElement;
  now: number;
  delta: number;
};

export type GpuEngineInternals = {
  device: GpuDevice;
  format: string;
  onPreRender: (callback: (ctx: GpuPreRenderContext) => void) => () => void;
};

const GPU_INTERNALS = Symbol.for("shooosh.gpuInternals");

type EngineWithInternals = WebGLEngine & {
  [GPU_INTERNALS]?: GpuEngineInternals;
};

export function registerGpuInternals(
  engine: WebGLEngine,
  internals: GpuEngineInternals,
) {
  (engine as EngineWithInternals)[GPU_INTERNALS] = internals;
}

export function getGpuInternals(engine: WebGLEngine): GpuEngineInternals | null {
  return (engine as EngineWithInternals)[GPU_INTERNALS] ?? null;
}

export function clearGpuInternals(engine: WebGLEngine) {
  delete (engine as EngineWithInternals)[GPU_INTERNALS];
}
