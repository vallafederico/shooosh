/**
 * WebGPU pipeline + buffer helpers. Not a public import.
 *
 * How to use: gpu-plane / gpu-item call compileGpuPipeline on wrapped WGSL.
 * Compile failure: keep the last good pipeline, log, do not blank the page.
 *
 * Docs: docs/shader-contract.md
 */

import {
  type GpuBindGroup,
  type GpuDevice,
  type GpuRenderPipeline,
} from "../engine/gpu-api";

export type GpuProgram = {
  poll: () => GpuRenderPipeline | null;
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

function pipelineDescriptor(module: unknown, format: string, label: string) {
  return {
    label,
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vsMain",
      buffers: [
        {
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: "fsEntry",
      targets: [
        {
          format,
          blend: PREMULTIPLIED_BLEND,
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  };
}

/** Compile a WGSL module into a render pipeline without throwing. Last good pipeline stays if recreate fails. */
export function compileGpuPipeline(
  device: GpuDevice,
  code: string,
  format: string,
  label: string,
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

      const descriptor = pipelineDescriptor(module, format, label);
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
    destroy() {
      destroyed = true;
      pipeline = null;
    },
  };
}

export function createUniformBuffer(device: GpuDevice, label: string) {
  return device.createBuffer({
    label,
    size: 64,
    usage: 0x0040 | 0x0008, // UNIFORM | COPY_DST
  });
}

export function createBindGroup(
  device: GpuDevice,
  pipeline: GpuRenderPipeline,
  buffer: import("../engine/gpu-api").GpuBuffer,
  label: string,
): GpuBindGroup {
  return device.createBindGroup({
    label,
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer } }],
  });
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
    size: data.byteLength,
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
