/**
 * createCompute — WebGPU compute session types.
 *
 * How to use: see createCompute in ./compute.ts. WebGL2 → null.
 */

import type {
  GpuBindGroupEntryResource,
  GpuCommandEncoder,
  GpuComputePipeline,
  GpuDevice,
  GpuRenderPass,
  GpuRenderPipeline,
  GpuTexture,
  GpuTextureView,
} from "../engine/gpu-api";

/** Storage texture pair with swap() for ping-pong passes. */
export type ComputePingPong = {
  readonly read: GpuTexture;
  readonly write: GpuTexture;
  readonly readView: GpuTextureView;
  readonly writeView: GpuTextureView;
  swap: () => void;
  destroy: () => void;
};

export type ComputeTickContext = {
  device: GpuDevice;
  encoder: GpuCommandEncoder;
  canvas: HTMLCanvasElement;
  now: number;
  delta: number;
};

export type ComputeDisplayContext = {
  pass: GpuRenderPass;
  device: GpuDevice;
  format: string;
};

export type CreateComputeOptions = {
  /**
   * Runs every frame before site draws (same encoder as the WebGPU engine).
   * Keep work here — not in onDisplay.
   */
  onCompute?: (ctx: ComputeTickContext) => void;
  /**
   * Optional fullscreen / scene draw into the current GPU render pass.
   * Default layer −100 (behind items).
   */
  onDisplay?: (ctx: ComputeDisplayContext) => void;
  displayLayer?: number;
};

export type ComputeSession = {
  readonly device: GpuDevice;
  readonly format: string;
  readonly canvas: HTMLCanvasElement;

  /** Keep the settle loop awake (e.g. after queuing work). */
  requestFrame: () => void;

  createPipeline: (code: string, label?: string) => GpuComputePipeline;
  createDisplayPipeline: (
    code: string,
    label?: string,
  ) => GpuRenderPipeline;
  createPingPong: (
    width: number,
    height: number,
    label?: string,
    format?: string,
  ) => ComputePingPong;
  createStorageTexture: (
    width: number,
    height: number,
    label?: string,
    format?: string,
  ) => GpuTexture;
  createUniformBuffer: (byteSize: number, label?: string) => import("../engine/gpu-api").GpuBuffer;
  writeBuffer: (
    buffer: import("../engine/gpu-api").GpuBuffer,
    data: Float32Array | ArrayBufferView,
    offset?: number,
  ) => void;

  /**
   * One compute pass: set pipeline, bind group 0 from entries, dispatch ceil(w/8)×ceil(h/8).
   */
  dispatch: (
    encoder: GpuCommandEncoder,
    pipeline: GpuComputePipeline,
    width: number,
    height: number,
    entries: Array<{ binding: number; resource: GpuBindGroupEntryResource }>,
    label?: string,
  ) => void;

  /** Replace the compute tick (previous unsubscribed). Pass null to clear. */
  setOnCompute: (callback: ((ctx: ComputeTickContext) => void) | null) => void;
  /** Replace the display draw. Pass null to clear. */
  setOnDisplay: (
    callback: ((ctx: ComputeDisplayContext) => void) | null,
    layer?: number,
  ) => void;

  destroy: () => void;
};
