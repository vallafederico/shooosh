/**
 * WebGPU DOM-quad renderer. Not a public import.
 *
 * How to use: ItemManager constructs this when engine.backend === "webgpu".
 * Same item API as the WebGL2 path. Fragment is wrapWgslFragment(fsMain).
 * With `options.texture` from loadTexture, sample
 * `textureSample(uTexture, uSampler, fitUv(vUv))` for CSS-like cover/contain.
 * Named `maps` bind after it (@binding 3+, name order); an empty slot binds
 * one transparent texel, and `mapsChanged` rebuilds the bind group.
 *
 * Docs: docs/shader-contract.md
 */

import type { EngineFrame } from "../engine/engine";
import {
  getGpuFrame,
  sceneDepthStencil,
  GPU_BUFFER_USAGE,
  GPU_TEXTURE_USAGE,
  type GpuBindGroup,
  type GpuBuffer,
  type GpuDevice,
  type GpuRenderPipeline,
  type GpuSampler,
  type GpuTextureView,
} from "../engine/gpu-api";
import type { UniWatchController } from "../engine/uni";
import {
  resolveTextureUvTransform,
  textureFitToUni,
  type TextureFitMode,
} from "../loaders/texture-loader";
import {
  compileGpuPipeline,
  createUniformBuffer,
  resolveGpuTextureBinding,
  writeBufferFromArray,
  type GpuProgram,
} from "../shaders/gpu-compile";
import { MAP_BINDING_START, resolveWgslModule } from "../shaders/wgsl-wrap";
import { getElementClipData } from "./item.utils";
import type { ItemIntegration } from "./item-integration";
import type { ItemOptions } from "./item";

export type GpuItemRenderer = {
  render: (frame: EngineFrame) => "pending" | "drawn" | "culled" | "failed";
  mapsChanged: () => void;
  destroy: () => void;
};

// Explicit layouts keep the standard uniform binding valid even when a custom
// fragment does not read it. Auto layouts strip unused bindings. Keyed by
// whether uTexture is bound and how many maps follow it.
const layouts = new WeakMap<GpuDevice, Map<string, unknown>>();
function itemLayout(device: GpuDevice, textured: boolean, mapCount: number) {
  let cached = layouts.get(device);
  if (!cached) { cached = new Map(); layouts.set(device, cached); }
  const key = `${textured ? 1 : 0}:${mapCount}`;
  if (cached.has(key)) return cached.get(key);
  const entries: Parameters<GpuDevice["createBindGroupLayout"]>[0]["entries"] = [
    { binding: 0, visibility: 2, buffer: { type: "uniform" } },
  ];
  if (textured || mapCount > 0) entries.push({ binding: 1, visibility: 2, sampler: { type: "filtering" } });
  if (textured) entries.push({ binding: 2, visibility: 2, texture: { sampleType: "float" } });
  for (let i = 0; i < mapCount; i++) {
    entries.push({ binding: MAP_BINDING_START + i, visibility: 2, texture: { sampleType: "float" } });
  }
  const layout = device.createPipelineLayout({ bindGroupLayouts: [device.createBindGroupLayout({ entries })] });
  cached.set(key, layout);
  return layout;
}

/** One transparent texel per device: what an empty map slot binds. */
const emptyViews = new WeakMap<GpuDevice, GpuTextureView>();
function emptyMapView(device: GpuDevice) {
  let view = emptyViews.get(device);
  if (view) return view;
  const texture = device.createTexture({
    label: "item-map-empty",
    size: { width: 1, height: 1 },
    format: "rgba8unorm",
    usage: GPU_TEXTURE_USAGE.TEXTURE_BINDING | GPU_TEXTURE_USAGE.COPY_DST,
  });
  device.queue.writeTexture?.({ texture }, new Uint8Array(4), { bytesPerRow: 4 }, { width: 1, height: 1 });
  view = texture.createView();
  emptyViews.set(device, view);
  return view;
}

/** A shared linear clamp sampler per device, for maps on an item without uTexture. */
const mapSamplers = new WeakMap<GpuDevice, GpuSampler>();
function mapSampler(device: GpuDevice) {
  let sampler = mapSamplers.get(device);
  if (!sampler) {
    sampler = device.createSampler({ label: "item-map-sampler", magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    mapSamplers.set(device, sampler);
  }
  return sampler;
}

export function createGpuItemRenderer(
  element: HTMLElement,
  options: ItemOptions,
  uni: UniWatchController,
  integration?: ItemIntegration,
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
    maps: Object.keys(options.maps ?? {}),
  });
  const program: GpuProgram = compileGpuPipeline(device, wgsl.code, format, "item", {
    layout: itemLayout(device, wgsl.usesTexture, wgsl.maps.length),
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

  function createItemBindGroup(pipeline: GpuRenderPipeline) {
    const entries: Parameters<GpuDevice["createBindGroup"]>[0]["entries"] = [
      { binding: 0, resource: { buffer: uniformBuffer } },
    ];
    if (wgsl.usesTexture && textureBinding) {
      entries.push({ binding: 1, resource: textureBinding.sampler }, { binding: 2, resource: textureBinding.view });
    } else if (wgsl.maps.length > 0) {
      entries.push({ binding: 1, resource: mapSampler(device) });
    }
    wgsl.maps.forEach((name, i) => {
      const map = resolveGpuTextureBinding(device, options.maps?.[name] ?? null, `item-${name}`);
      entries.push({ binding: MAP_BINDING_START + i, resource: map?.view ?? emptyMapView(device) });
    });
    return device.createBindGroup({ label: "item-bind", layout: pipeline.getBindGroupLayout(0), entries });
  }

  return {
    mapsChanged() {
      bindGroup = null;
    },
    render(nextFrame) {
      const frame = getGpuFrame();
      if (!frame) return "pending";
      const pipeline = program.poll();
      if (!pipeline) return program.status() === "failed" ? "failed" : "pending";

      const clipData = integration?.geometry(clipVertices) ?? getElementClipData(element, nextFrame.canvas, clipVertices);
      if (!clipData.isVisible) return "culled";

      if (!bindGroup) bindGroup = createItemBindGroup(pipeline);

      if (integration?.uv) uni.set(textureFitToUni(integration.uv()));
      if (options.texture && wgsl.usesTexture && !integration?.uv) {
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
      return "drawn";
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
