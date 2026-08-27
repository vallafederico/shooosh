import { getGpuFrame, GPU_BUFFER_USAGE, type GpuBindGroup } from "../engine/gpu-api";
import { ensureWatchableUni, type UniWatchController } from "../engine/uni";
import {
  compileGpuPipeline,
  createBindGroup,
  createStaticBuffer,
  createUniformBuffer,
  writeBufferFromArray,
  type GpuProgram,
} from "../shaders/gpu-compile";
import { resolveWgslFragment } from "../shaders/wgsl-wrap";
import {
  createFullscreenPlaneGeometry,
  type FullscreenPlaneGeometry,
  type FullscreenPlaneInitOptions,
  type FullscreenPlaneRenderer,
} from "./plane";

export function createGpuFullscreenPlaneRenderer(
  options: FullscreenPlaneInitOptions = {},
  uni?: UniWatchController,
): FullscreenPlaneRenderer {
  const geometry = createFullscreenPlaneGeometry(options);
  const gpu = getGpuFrame();
  if (!gpu) {
    throw new Error("WebGPU frame context is missing; cannot create a GPU plane.");
  }

  const { device, format } = gpu;
  const uniWatch = uni ?? ensureWatchableUni(options.uni ?? { value1: 1 });
  let uniValues = uniWatch.toFloat32(16);
  const unsubscribeUni = uniWatch.subscribe(() => {
    uniValues = uniWatch.toFloat32(16);
  });

  if (options.texture) {
    console.warn("shooosh: screen textures are not implemented on the WebGPU backend yet.");
  }

  const wgsl = resolveWgslFragment({
    fragment: options.shaders?.fragment ?? options.shaders?.wgsl,
    debugUv: options.debugUv,
    kind: "screen",
  });
  const program: GpuProgram = compileGpuPipeline(device, wgsl, format, "plane");
  const uniformBuffer = createUniformBuffer(device, "plane-uni");
  const vertexBuffer = createStaticBuffer(
    device,
    geometry.vertices,
    GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    "plane-vertex",
  );
  const indexBuffer = createStaticBuffer(
    device,
    geometry.indices,
    GPU_BUFFER_USAGE.INDEX | GPU_BUFFER_USAGE.COPY_DST,
    "plane-index",
  );
  const indexFormat = geometry.indices instanceof Uint32Array ? "uint32" : "uint16";
  let bindGroup: GpuBindGroup | null = null;

  return {
    geometry,
    render() {
      const frame = getGpuFrame();
      if (!frame) return;
      const pipeline = program.poll();
      if (!pipeline) return;

      if (!bindGroup) {
        bindGroup = createBindGroup(device, pipeline, uniformBuffer, "plane-bind");
      }

      uniWatch.set({
        value4: performance.now() * 0.001,
      });
      writeBufferFromArray(device, uniformBuffer, uniValues);

      const pass = frame.pass;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.setIndexBuffer(indexBuffer, indexFormat);
      pass.drawIndexed(geometry.indexCount);
    },
    destroy() {
      unsubscribeUni();
      program.destroy();
      uniformBuffer.destroy();
      vertexBuffer.destroy();
      indexBuffer.destroy();
      bindGroup = null;
    },
  };
}
