/**
 * Structural WebGPU types so the package compiles without `@webgpu/types`.
 *
 * How to use: engine / gpu-plane / gpu-item / fluid import these shapes. Browser
 * GPUDevice / GPUCanvasContext satisfy them at runtime.
 *
 * Do not export this from package/index.ts. Do not add @webgpu/types as a
 * runtime dependency.
 */

export const GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
} as const;

export const GPU_TEXTURE_USAGE = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
} as const;

export const GPU_SHADER_STAGE = {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4,
} as const;

/**
 * Depth format of the scene pass. The engine always attaches a depth buffer, so
 * every pipeline drawn inside that pass must declare a matching `depthStencil`.
 */
export const GPU_DEPTH_FORMAT = "depth24plus";

/**
 * Depth state for a pipeline drawn in the engine scene pass. Flat drawables keep
 * the defaults (no write, always pass) so they layer exactly like they do on
 * WebGL2; meshes ask for `{ write: true, compare: "less" }`.
 */
export function sceneDepthStencil(
  options: { write?: boolean; compare?: string } = {},
) {
  return {
    format: GPU_DEPTH_FORMAT,
    depthWriteEnabled: options.write ?? false,
    depthCompare: options.compare ?? "always",
  };
}

export type GpuExternalImageSource =
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas
  | HTMLImageElement
  | HTMLVideoElement;

export type GpuQueue = {
  writeBuffer: (
    buffer: GpuBuffer,
    offset: number,
    data: ArrayBufferView | ArrayBuffer,
  ) => void;
  copyExternalImageToTexture?: (
    source: { source: GpuExternalImageSource; flipY?: boolean },
    destination: { texture: GpuTexture; premultipliedAlpha?: boolean },
    size: { width: number; height: number },
  ) => void;
  writeTexture?: (
    destination: { texture: GpuTexture },
    data: ArrayBufferView,
    dataLayout: { offset?: number; bytesPerRow?: number; rowsPerImage?: number },
    size: { width: number; height: number },
  ) => void;
  submit: (commandBuffers: unknown[]) => void;
};

export type GpuBuffer = {
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

export type GpuTextureView = { readonly __textureView?: never };

export type GpuTexture = {
  createView: (descriptor?: {
    format?: string;
    dimension?: string;
    baseMipLevel?: number;
    mipLevelCount?: number;
    label?: string;
  }) => GpuTextureView;
  destroy: () => void;
};

export type GpuSampler = { readonly __sampler?: never };

export type GpuShaderModule = {
  getCompilationInfo?: () => Promise<{
    messages: Array<{ type: string; message: string }>;
  }>;
};

export type GpuBindGroup = { readonly __bindGroup?: never };

export type GpuRenderPipeline = {
  getBindGroupLayout: (index: number) => unknown;
};

export type GpuComputePipeline = {
  getBindGroupLayout: (index: number) => unknown;
};

export type GpuRenderPass = {
  setPipeline: (pipeline: GpuRenderPipeline) => void;
  setBindGroup: (index: number, group: GpuBindGroup) => void;
  setVertexBuffer: (slot: number, buffer: GpuBuffer) => void;
  setIndexBuffer: (buffer: GpuBuffer, format: "uint16" | "uint32") => void;
  draw: (vertexCount: number, instanceCount?: number) => void;
  drawIndexed: (count: number) => void;
  end: () => void;
};

export type GpuComputePass = {
  setPipeline: (pipeline: GpuComputePipeline) => void;
  setBindGroup: (index: number, group: GpuBindGroup) => void;
  dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
  end: () => void;
};

export type GpuCommandEncoder = {
  beginRenderPass: (descriptor: unknown) => GpuRenderPass;
  beginComputePass: (descriptor?: { label?: string }) => GpuComputePass;
  copyTextureToTexture?: (
    source: { texture: GpuTexture },
    destination: { texture: GpuTexture },
    size: { width: number; height: number },
  ) => void;
  finish: () => unknown;
};

export type GpuBindGroupEntryResource =
  | { buffer: GpuBuffer; offset?: number; size?: number }
  | GpuTextureView
  | GpuSampler;

export type GpuDevice = {
  readonly queue: GpuQueue;
  createBuffer: (descriptor: {
    size: number;
    usage: number;
    mappedAtCreation?: boolean;
    label?: string;
  }) => GpuBuffer;
  createTexture: (descriptor: {
    size: { width: number; height: number; depthOrArrayLayers?: number };
    format: string;
    usage: number;
    mipLevelCount?: number;
    label?: string;
  }) => GpuTexture;
  createSampler: (descriptor?: {
    magFilter?: "nearest" | "linear";
    minFilter?: "nearest" | "linear";
    mipmapFilter?: "nearest" | "linear";
    addressModeU?: "clamp-to-edge" | "repeat" | "mirror-repeat";
    addressModeV?: "clamp-to-edge" | "repeat" | "mirror-repeat";
    label?: string;
  }) => GpuSampler;
  createShaderModule: (descriptor: { code: string; label?: string }) => GpuShaderModule;
  createBindGroup: (descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: GpuBindGroupEntryResource }>;
    label?: string;
  }) => GpuBindGroup;
  createBindGroupLayout: (descriptor: {
    label?: string;
    entries: Array<{
      binding: number;
      visibility: number;
      buffer?: { type?: "uniform" | "storage" | "read-only-storage" };
      sampler?: { type?: "filtering" | "non-filtering" | "comparison" };
      texture?: {
        sampleType?: "float" | "unfilterable-float" | "depth" | "sint" | "uint";
        viewDimension?: string;
      };
    }>;
  }) => unknown;
  createPipelineLayout: (descriptor: {
    label?: string;
    bindGroupLayouts: unknown[];
  }) => unknown;
  createRenderPipeline: (descriptor: unknown) => GpuRenderPipeline;
  createRenderPipelineAsync?: (descriptor: unknown) => Promise<GpuRenderPipeline>;
  createComputePipeline: (descriptor: unknown) => GpuComputePipeline;
  createComputePipelineAsync?: (descriptor: unknown) => Promise<GpuComputePipeline>;
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
    usage?: number;
  }) => void;
  getCurrentTexture: () => GpuTexture;
};

export type GpuAdapter = {
  requestDevice: (descriptor?: unknown) => Promise<GpuDevice>;
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

/**
 * Handles the WebGPU post chain needs. The scene pass has already ended, so post
 * opens its own passes on `encoder` and presents into the canvas.
 *
 * The canvas texture is acquired lazily: a post chain that is not ready yet must
 * simply not call these, and the browser keeps showing the previous frame
 * instead of an empty canvas.
 */
export type GpuPostFrameHandles = {
  device: GpuDevice;
  format: string;
  encoder: GpuCommandEncoder;
  /** Colour attachment for the final present pass. */
  getTargetView: () => unknown;
  /** Canvas texture, for the fail-soft copy while pipelines compile. */
  getTargetTexture: () => GpuTexture;
};

let currentGpuFrame: GpuFrameHandles | null = null;
let currentGpuPostFrame: GpuPostFrameHandles | null = null;

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

export function runWithGpuPostFrame<T>(handles: GpuPostFrameHandles, fn: () => T): T {
  currentGpuPostFrame = handles;
  try {
    return fn();
  } finally {
    currentGpuPostFrame = null;
  }
}

export function getGpuPostFrame(): GpuPostFrameHandles | null {
  return currentGpuPostFrame;
}
