/**
 * Structural WebGPU types so the package compiles without @webgpu/types.
 * Browser objects satisfy these shapes at runtime.
 */

export const GPU_BUFFER_USAGE = {
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
} as const;

export type GpuQueue = {
  writeBuffer: (
    buffer: GpuBuffer,
    offset: number,
    data: ArrayBufferView | ArrayBuffer,
  ) => void;
  submit: (commandBuffers: unknown[]) => void;
};

export type GpuBuffer = {
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

export type GpuShaderModule = {
  getCompilationInfo?: () => Promise<{
    messages: Array<{ type: string; message: string }>;
  }>;
};

export type GpuBindGroup = { readonly __bindGroup?: never };

export type GpuRenderPipeline = {
  getBindGroupLayout: (index: number) => unknown;
};

export type GpuRenderPass = {
  setPipeline: (pipeline: GpuRenderPipeline) => void;
  setBindGroup: (index: number, group: GpuBindGroup) => void;
  setVertexBuffer: (slot: number, buffer: GpuBuffer) => void;
  setIndexBuffer: (buffer: GpuBuffer, format: "uint16" | "uint32") => void;
  drawIndexed: (count: number) => void;
  end: () => void;
};

export type GpuCommandEncoder = {
  beginRenderPass: (descriptor: unknown) => GpuRenderPass;
  finish: () => unknown;
};

export type GpuDevice = {
  readonly queue: GpuQueue;
  createBuffer: (descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
    label?: string;
  }) => GpuBuffer;
  createShaderModule: (descriptor: { code: string; label?: string }) => GpuShaderModule;
  createBindGroup: (descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: GpuBuffer } }>;
    label?: string;
  }) => GpuBindGroup;
  createRenderPipeline: (descriptor: unknown) => GpuRenderPipeline;
  createRenderPipelineAsync?: (descriptor: unknown) => Promise<GpuRenderPipeline>;
  createCommandEncoder: (descriptor?: { label?: string }) => GpuCommandEncoder;
  pushErrorScope: (filter: "validation" | "out-of-memory" | "internal") => void;
  popErrorScope: () => Promise<{ message: string } | null>;
  destroy: () => void;
};

export type GpuCanvasContext = {
  configure: (configuration: {
    device: GpuDevice;
    format: string;
    alphaMode?: "opaque" | "premultiplied" | "unpremultiplied";
  }) => void;
  getCurrentTexture: () => { createView: () => unknown };
};

export type GpuAdapter = {
  requestDevice: () => Promise<GpuDevice>;
};

export type Gpu = {
  requestAdapter: () => Promise<GpuAdapter | null>;
  getPreferredCanvasFormat: () => string;
};

export type GpuFrameHandles = {
  device: GpuDevice;
  context: GpuCanvasContext;
  format: string;
  encoder: GpuCommandEncoder;
  pass: GpuRenderPass;
};

export function getNavigatorGpu(): Gpu | undefined {
  return (globalThis as { navigator?: { gpu?: Gpu } }).navigator?.gpu;
}

export function getGpuCanvasContext(canvas: HTMLCanvasElement): GpuCanvasContext | null {
  return (
    canvas as HTMLCanvasElement & {
      getContext: (id: "webgpu") => GpuCanvasContext | null;
    }
  ).getContext("webgpu");
}

let currentGpuFrame: GpuFrameHandles | null = null;

export function runWithGpuFrame<T>(handles: GpuFrameHandles, fn: () => T): T {
  currentGpuFrame = handles;
  try {
    return fn();
  } finally {
    currentGpuFrame = null;
  }
}

export function getGpuFrame(): GpuFrameHandles | null {
  return currentGpuFrame;
}
