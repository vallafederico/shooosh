/**
 * WebGPU DOM-quad renderer. Not a public import.
 *
 * How to use: ItemManager constructs this when engine.backend === "webgpu".
 * Same item API as the WebGL2 path. Fragment is wrapWgslFragment(fsMain).
 * With `options.texture` from loadTexture, sample
 * `textureSample(uTexture, uSampler, fitUv(vUv))` for CSS-like cover/contain.
 *
 * Docs: docs/shader-contract.md
 */

import type { EngineFrame } from "../engine/engine";
import {
  getGpuFrame,
  sceneDepthStencil,
  GPU_BUFFER_USAGE,
  type GpuBindGroup,
  type GpuBuffer,
} from "../engine/gpu-api";
import type { UniWatchController } from "../engine/uni";
import {
  resolveTextureUvTransform,
  textureFitToUni,
  type TextureFitMode,
} from "../loaders/texture-loader";
import {
  compileGpuPipeline,
  createBindGroup,
  createUniformBuffer,
  resolveGpuTextureBinding,
  writeBufferFromArray,
  type GpuProgram,
} from "../shaders/gpu-compile";
import { resolveWgslModule } from "../shaders/wgsl-wrap";
import { getElementClipData } from "./item.utils";
import type { ItemOptions } from "./item";

export type GpuItemRenderer = {
  render: (frame: EngineFrame) => void;
  destroy: () => void;
};

export function createGpuItemRenderer(
  element: HTMLElement,
  options: ItemOptions,
  uni: UniWatchController,
): GpuItemRenderer {
  const gpu = getGpuFrame();
  if (!gpu) {
    throw new Error("WebGPU frame context is missing; cannot create a GPU item.");
  }

  const { device, format } = gpu;
  let uniValues = uni.toFloat32(16);
  const unsubscribeUni = uni.subscribe(() => {
    uniValues = uni.toFloat32(16);
  });

  const textureBinding = resolveGpuTextureBinding(device, options.texture ?? null, "item");

  const wgsl = resolveWgslModule({
    fragment: options.shaders?.fragment ?? options.shaders?.wgsl,
    debugUv: options.debugUv,
    kind: "item",
    hasTexture: Boolean(textureBinding),
  });
  const program: GpuProgram = compileGpuPipeline(device, wgsl.code, format, "item", {
    depthStencil: sceneDepthStencil(),
  });
  const uniformBuffer = createUniformBuffer(device, "item-uni");
  const vertexBuffer: GpuBuffer = device.createBuffer({
    label: "item-vertex",
    size: 16 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
  });
  const indexData = new Uint16Array([0, 1, 2, 2, 1, 3]);
  const indexBuffer = device.createBuffer({
    label: "item-index",
    size: indexData.byteLength,
    usage: GPU_BUFFER_USAGE.INDEX | GPU_BUFFER_USAGE.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint16Array(indexBuffer.getMappedRange()).set(indexData);
  indexBuffer.unmap();
  let bindGroup: GpuBindGroup | null = null;

  // Per-renderer scratch — getElementClipData fills this instead of allocating.
  const clipVertices = new Float32Array(16);
  // Texture-fit cache — recompute only when the (textureAspect, targetAspect,
  // fit) triple changes, so static frames stay clean for the settle loop.
  let lastFitTextureAspect = Number.NaN;
  let lastFitTargetAspect = Number.NaN;
  let lastFitMode: TextureFitMode | null = null;

  return {
    render(nextFrame) {
      const frame = getGpuFrame();
      if (!frame) return;
      const pipeline = program.poll();
      if (!pipeline) return;

      const clipData = getElementClipData(element, nextFrame.canvas, clipVertices);
      if (!clipData.isVisible) return;

      if (!bindGroup) {
        bindGroup = createBindGroup(
          device,
          pipeline,
          uniformBuffer,
          "item-bind",
          wgsl.usesTexture ? textureBinding : null,
        );
      }

      if (options.texture && wgsl.usesTexture) {
        const rect = clipData.rect;
        const targetAspect =
          Math.max(1, rect.width) / Math.max(1, rect.height);
        const fit = options.textureFit ?? "cover";
        if (
          options.texture.aspect !== lastFitTextureAspect ||
          targetAspect !== lastFitTargetAspect ||
          fit !== lastFitMode
        ) {
          lastFitTextureAspect = options.texture.aspect;
          lastFitTargetAspect = targetAspect;
          lastFitMode = fit;
          const uvTransform = resolveTextureUvTransform(
            options.texture.aspect,
            targetAspect,
            fit,
          );
          uni.set(textureFitToUni(uvTransform));
        }
      }

      writeBufferFromArray(device, uniformBuffer, uniValues);
      writeBufferFromArray(device, vertexBuffer, clipData.vertices);

      const pass = frame.pass;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.setIndexBuffer(indexBuffer, "uint16");
      pass.drawIndexed(6);
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
