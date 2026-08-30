/**
 * WebGPU pipeline + buffer helpers. Not a public import.
 *
 * How to use: gpu-plane / gpu-item call compileGpuPipeline on wrapped WGSL.
 * Compile failure: keep the last good pipeline, log, do not blank the page.
 *
 * Anything drawn in the engine scene pass must pass `depthStencil:
 * sceneDepthStencil(...)` (engine/gpu-api) — that pass always has a depth
 * attachment, and a pipeline without matching depth state fails validation.
 *
 * Docs: docs/shader-contract.md
 */

import {
  type GpuBindGroup,
  type GpuDevice,
  type GpuRenderPipeline,
  type GpuSampler,
  type GpuTextureView,
} from "../engine/gpu-api";

export type GpuProgram = {
  poll: () => GpuRenderPipeline | null;
  /** `compiling` until the pipeline settles; then `ready` or `failed`. */
  status: () => "compiling" | "ready" | "failed";
  destroy: () => void;
};

const PREMULTIPLIED_BLEND = {
  color: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
};

const PLANE_VERTEX_BUFFERS = [
  {
    arrayStride: 16,
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x2" },
      { shaderLocation: 1, offset: 8, format: "float32x2" },
    ],
  },
];

/**
 * Pipeline shape overrides. Defaults match the screen / item plane: auto layout,
 * position+uv vertex buffer, premultiplied blend. Post passes override all three
 * (explicit layout so unused bindings are legal, no vertex buffer, no blend).
 */
export type GpuPipelineOptions = {
  layout?: unknown;
  /** null = generate vertices in the shader (no vertex buffer bound). */
  vertexBuffers?: unknown[] | null;
  /** null = write the fragment output straight to the target. */
  blend?: unknown | null;
  /**
   * Required for anything drawn in the engine scene pass, which always carries a
   * depth attachment. Use `sceneDepthStencil()` from engine/gpu-api. Post passes
   * open their own depth-less passes and leave this undefined.
   */
  depthStencil?: unknown;
  vertexEntryPoint?: string;
  fragmentEntryPoint?: string;
  primitive?: unknown;
};

function pipelineDescriptor(
  module: unknown,
  format: string,
  label: string,
  options: GpuPipelineOptions = {},
) {
  const buffers =
    options.vertexBuffers === null
      ? undefined
      : (options.vertexBuffers ?? PLANE_VERTEX_BUFFERS);
  const blend = options.blend === null ? undefined : (options.blend ?? PREMULTIPLIED_BLEND);
  return {
    label,
    layout: options.layout ?? "auto",
    vertex: {
      module,
      entryPoint: options.vertexEntryPoint ?? "vsMain",
      ...(buffers ? { buffers } : {}),
    },
    fragment: {
      module,
      entryPoint: options.fragmentEntryPoint ?? "fsEntry",
      targets: [
        {
          format,
          ...(blend ? { blend } : {}),
        },
      ],
    },
    primitive: options.primitive ?? { topology: "triangle-list" },
    ...(options.depthStencil ? { depthStencil: options.depthStencil } : {}),
  };
}

function compileGpuPipelineUncached(
  device: GpuDevice,
  code: string,
  format: string,
  label: string,
  options: GpuPipelineOptions = {},
): GpuProgram {
  let pipeline: GpuRenderPipeline | null = null;
  let failed = false;
  let destroyed = false;

  const start = async () => {
    device.pushErrorScope("validation");
    const module = device.createShaderModule({ code, label });
    try {
      const info = await module.getCompilationInfo?.();
      const errors = info?.messages.filter((message) => message.type === "error") ?? [];
      if (errors.length > 0) {
        console.warn(
          `[shader] "${label}" failed to compile:\n${errors.map((entry) => entry.message).join("\n")}`,
        );
        await device.popErrorScope();
        failed = true;
        return;
      }

      const descriptor = pipelineDescriptor(module, format, label, options);
      const created = device.createRenderPipelineAsync
        ? await device.createRenderPipelineAsync(descriptor)
        : device.createRenderPipeline(descriptor);
      const error = await device.popErrorScope();
      if (error) {
        console.warn(`[shader] "${label}" failed to create pipeline:\n${error.message}`);
        failed = true;
        return;
      }
      if (!destroyed) pipeline = created;
    } catch (error) {
      try {
        await device.popErrorScope();
      } catch {
        // scope already popped
      }
      console.warn(`[shader] "${label}" failed to compile or link:`, error);
      failed = true;
    }
  };

  void start();

  return {
    poll() {
      if (failed) return null;
      return pipeline;
    },
    status() {
      if (failed) return "failed";
      return pipeline ? "ready" : "compiling";
    },
    destroy() {
      destroyed = true;
      pipeline = null;
    },
  };
}

/**
 * Stable cache-key fragment for a pipeline option value. Plain objects and
 * arrays serialize structurally; anything else (a GPUPipelineLayout, …) keys
 * by identity so two different layouts can never collide on "{}".
 */
const optionObjectIds = new WeakMap<object, number>();
let nextOptionObjectId = 1;

function optionKeyPart(value: unknown): string {
  if (value === undefined) return "u";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(optionKeyPart).join(",")}]`;
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}:${optionKeyPart(entry)}`)
      .join(",")}}`;
  }
  let id = optionObjectIds.get(value);
  if (!id) {
    id = nextOptionObjectId++;
    optionObjectIds.set(value, id);
  }
  return `#${id}`;
}

type PipelineCacheEntry = { inner: GpuProgram; refs: number };

/**
 * Per-device pipeline cache — N items with the same wrapped WGSL share one
 * pipeline. Keyed per GpuDevice (WeakMap) so a replaced/lost device never
 * serves another device's pipelines.
 */
const pipelineCacheByDevice = new WeakMap<GpuDevice, Map<string, PipelineCacheEntry>>();

/** Compile a WGSL module into a render pipeline without throwing. Last good pipeline stays if recreate fails. */
export function compileGpuPipeline(
  device: GpuDevice,
  code: string,
  format: string,
  label: string,
  options: GpuPipelineOptions = {},
): GpuProgram {
  let cache = pipelineCacheByDevice.get(device);
  if (!cache) {
    cache = new Map();
    pipelineCacheByDevice.set(device, cache);
  }
  const key = [
    format,
    optionKeyPart(options.layout),
    optionKeyPart(options.vertexBuffers),
    optionKeyPart(options.blend),
    optionKeyPart(options.depthStencil),
    optionKeyPart(options.vertexEntryPoint),
    optionKeyPart(options.fragmentEntryPoint),
    optionKeyPart(options.primitive),
    code,
  ].join("\u0000");
  let entry = cache.get(key);
  if (!entry) {
    entry = { inner: compileGpuPipelineUncached(device, code, format, label, options), refs: 0 };
    cache.set(key, entry);
  }
  entry.refs += 1;
  const shared = entry;

  // Refcounted handle — the cache entry is dropped only when the last user
  // releases it, so destroy() on one item never stalls its twins.
  let released = false;
  return {
    poll() {
      if (released) return null;
      return shared.inner.poll();
    },
    status() {
      return shared.inner.status();
    },
    destroy() {
      if (released) return;
      released = true;
      shared.refs -= 1;
      if (shared.refs <= 0) {
        cache.delete(key);
        shared.inner.destroy();
      }
    },
  };
}

export function createUniformBuffer(device: GpuDevice, label: string, size = 64) {
  return device.createBuffer({
    label,
    size,
    usage: 0x0040 | 0x0008, // UNIFORM | COPY_DST
  });
}

/** Sampler + view pair for the injected uSampler / uTexture bindings. */
export type GpuTextureBinding = {
  view: GpuTextureView;
  sampler: GpuSampler;
};

export function createBindGroup(
  device: GpuDevice,
  pipeline: GpuRenderPipeline,
  buffer: import("../engine/gpu-api").GpuBuffer,
  label: string,
  texture?: GpuTextureBinding | null,
): GpuBindGroup {
  const entries: Array<{
    binding: number;
    resource: import("../engine/gpu-api").GpuBindGroupEntryResource;
  }> = [{ binding: 0, resource: { buffer } }];
  if (texture) {
    entries.push({ binding: 1, resource: texture.sampler });
    entries.push({ binding: 2, resource: texture.view });
  }
  return device.createBindGroup({
    label,
    layout: pipeline.getBindGroupLayout(0),
    entries,
  });
}

/**
 * Turn a loadTexture() result into WebGPU bind resources. Returns null (and
 * warns once per call site) when the handle came from the WebGL2 loader, so a
 * mismatched texture degrades to "no texture" instead of a validation error.
 */
export function resolveGpuTextureBinding(
  device: GpuDevice,
  texture:
    | {
        view?: unknown;
        sampler?: unknown | null;
        texture?: { backend?: string; createView?: () => unknown } | null;
      }
    | null
    | undefined,
  label: string,
): GpuTextureBinding | null {
  if (!texture) return null;
  const handle = texture.texture ?? null;
  if (handle?.backend && handle.backend !== "webgpu") {
    console.warn(
      "shooosh: ignoring a WebGL2 texture on the WebGPU backend. Load textures after the engine starts so loadTexture picks the right backend.",
    );
    return null;
  }
  const view = (texture.view ?? handle?.createView?.() ?? null) as GpuTextureView | null;
  if (!view) return null;
  const sampler = (texture.sampler ??
    device.createSampler({
      label: `${label}-sampler`,
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    })) as GpuSampler;
  return { view, sampler };
}

export function writeBufferFromArray(
  device: GpuDevice,
  buffer: import("../engine/gpu-api").GpuBuffer,
  data: Float32Array | Uint16Array | Uint32Array,
) {
  device.queue.writeBuffer(buffer, 0, data);
}

export function createStaticBuffer(
  device: GpuDevice,
  data: Float32Array | Uint16Array | Uint32Array,
  usage: number,
  label: string,
) {
  const buffer = device.createBuffer({
    label,
    // Mapped buffers must be a multiple of 4 bytes; an odd uint16 index count is not.
    size: Math.ceil(data.byteLength / 4) * 4,
    usage,
    mappedAtCreation: true,
  });
  const view =
    data instanceof Float32Array
      ? new Float32Array(buffer.getMappedRange())
      : data instanceof Uint32Array
        ? new Uint32Array(buffer.getMappedRange())
        : new Uint16Array(buffer.getMappedRange());
  view.set(data);
  buffer.unmap();
  return buffer;
}
