/**
 * WebGPU MSDF glyph renderer. Not a public import.
 *
 * How to use: createMsdfGlyphs() constructs this when frame.backend is
 * "webgpu". Instanced quads, one per glyph, with the same median-of-three
 * distance decode as the WebGL2 path. The atlas comes from loadTexture, so its
 * handle must be a WebGPU one (load it after the engine starts).
 *
 * Docs: docs/msdf.md · skill shooosh-msdf
 */

import { getDefaultEngine, type EngineFrame } from "../engine/engine";
import {
  getGpuFrame,
  sceneDepthStencil,
  GPU_BUFFER_USAGE,
  type GpuBindGroup,
  type GpuBuffer,
} from "../engine/gpu-api";
import {
  compileGpuPipeline,
  createBindGroup,
  createStaticBuffer,
  createUniformBuffer,
  resolveGpuTextureBinding,
  writeBufferFromArray,
  type GpuProgram,
} from "../shaders/gpu-compile";
import { getElementClipData } from "./item.utils";
import type { MsdfGlyphsOptions } from "./msdf-glyphs";

export type GpuMsdfGlyphsRenderer = {
  render: (frame: EngineFrame) => void;
  setGlyphData: (data: Float32Array, count: number) => void;
  setUni: (next: Partial<MsdfUni>) => void;
  destroy: () => void;
};

type MsdfUni = { value1: number; value2: number; value3: number; value4: number };

const MSDF_WGSL = `struct Uni {
  elementNdc: vec4f,
  values: vec4f,
  color: vec4f,
  params: vec4f,
}

@group(0) @binding(0) var<uniform> uUni: Uni;
@group(0) @binding(1) var uSampler: sampler;
@group(0) @binding(2) var uTexture: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) atlasUv: vec2f,
  @location(1) @interpolate(flat) dstWidth: f32,
  @location(2) @interpolate(flat) srcWidth: f32,
}

@vertex
fn vsMain(
  @location(0) aLocalXY: vec2f,
  @location(1) aDst: vec4f,
  @location(2) aSrc: vec4f,
) -> VsOut {
  let elemPos = mix(aDst.xy, aDst.zw, aLocalXY);

  let widthPx = max(uUni.values.y, 1.0);
  let heightPx = max(uUni.values.w, 1.0);
  let boxAspect = max(uUni.params.x, 0.0001);
  let fy = max(widthPx / (boxAspect * heightPx), 0.0001);
  let elemY = elemPos.y * fy + 0.5 * (1.0 - fy);

  let ndcX = mix(uUni.elementNdc.x, uUni.elementNdc.z, elemPos.x);
  let ndcY = mix(uUni.elementNdc.y, uUni.elementNdc.w, elemY);

  var out: VsOut;
  out.position = vec4f(ndcX, ndcY, 0.0, 1.0);
  out.atlasUv = mix(aSrc.xy, aSrc.zw, aLocalXY);
  out.dstWidth = aDst.z - aDst.x;
  out.srcWidth = aSrc.z - aSrc.x;
  return out;
}

fn median3(c: vec3f) -> f32 {
  return max(min(c.r, c.g), min(c.b, c.r));
}

@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  let msd = textureSample(uTexture, uSampler, in.atlasUv).rgb;
  let sd = median3(msd) - 0.5;

  let widthPx = max(uUni.values.y, 1.0);
  let glyphScreenPx = in.dstWidth * widthPx;
  let glyphAtlasPx = abs(in.srcWidth) * max(uUni.params.z, 1.0);
  let glyphMag = glyphScreenPx / max(glyphAtlasPx, 0.0001);
  // Canonical msdfgen coverage: saturates to exactly 0 outside the glyph even
  // when minified (a widened smoothstep window leaks alpha across the quad).
  let screenPxRange = max(uUni.params.y * glyphMag, 1.0);
  let alpha = clamp(sd * screenPxRange + 0.5, 0.0, 1.0) * uUni.color.w;
  return vec4f(uUni.color.rgb * alpha, alpha);
}
`;

/** TL, BL, TR, TR, BL, BR — matches the WebGL2 unit quad. */
const UNIT_QUAD = new Float32Array([
  0, 0,
  0, 1,
  1, 0,
  1, 0,
  0, 1,
  1, 1,
]);

const VERTEX_BUFFERS = [
  {
    arrayStride: 8,
    stepMode: "vertex",
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
  },
  {
    arrayStride: 32,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 1, offset: 0, format: "float32x4" },
      { shaderLocation: 2, offset: 16, format: "float32x4" },
    ],
  },
];

export function createGpuMsdfGlyphsRenderer(
  element: HTMLElement,
  options: MsdfGlyphsOptions,
): GpuMsdfGlyphsRenderer {
  const gpu = getGpuFrame();
  if (!gpu) {
    throw new Error("WebGPU frame context is missing; cannot create GPU glyphs.");
  }

  const { device, format } = gpu;
  const textureBinding = resolveGpuTextureBinding(device, options.texture, "msdf-glyphs");
  if (!textureBinding) {
    console.warn(
      "shooosh: createMsdfGlyphs needs a WebGPU atlas texture. Call loadTexture() after the engine starts.",
    );
    return {
      render() {},
      setGlyphData() {},
      setUni() {},
      destroy() {},
    };
  }

  const program: GpuProgram = compileGpuPipeline(device, MSDF_WGSL, format, "msdf-glyphs", {
    vertexBuffers: VERTEX_BUFFERS,
    depthStencil: sceneDepthStencil(),
  });
  const quadBuffer = createStaticBuffer(
    device,
    UNIT_QUAD,
    GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    "msdf-quad",
  );
  const uniformBuffer = createUniformBuffer(device, "msdf-uni");
  const uniformValues = new Float32Array(16);

  let glyphData = options.glyphData;
  let glyphCount = options.glyphCount;
  let instanceBuffer: GpuBuffer | null = null;
  let instanceCapacity = 0;
  let instanceDirty = true;
  let bindGroup: GpuBindGroup | null = null;

  const uni: MsdfUni = {
    value1: options.uni?.value1 ?? 0,
    value2: options.uni?.value2 ?? 1,
    value3: options.uni?.value3 ?? 0,
    value4: options.uni?.value4 ?? 1,
  };

  const ensureInstanceBuffer = () => {
    const byteLength = Math.max(32, glyphData.byteLength);
    if (instanceBuffer && instanceCapacity >= byteLength) return instanceBuffer;
    instanceBuffer?.destroy();
    instanceBuffer = device.createBuffer({
      label: "msdf-instances",
      size: byteLength,
      usage: GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    });
    instanceCapacity = byteLength;
    instanceDirty = true;
    return instanceBuffer;
  };

  return {
    render(nextFrame: EngineFrame) {
      const frame = getGpuFrame();
      if (!frame || glyphCount === 0) return;
      const pipeline = program.poll();
      if (!pipeline) return;

      const elementRect = element.getBoundingClientRect();
      const clipData = getElementClipData(element, nextFrame.canvas);
      if (!clipData.isVisible) return;

      if (!bindGroup) {
        bindGroup = createBindGroup(
          device,
          pipeline,
          uniformBuffer,
          "msdf-bind",
          textureBinding,
        );
      }

      const buffer = ensureInstanceBuffer();
      if (instanceDirty) {
        device.queue.writeBuffer(buffer, 0, glyphData);
        instanceDirty = false;
      }

      // clipData.vertices: [left, top, .., left, bottom, .., right, top, ..]
      const v = clipData.vertices;
      uniformValues[0] = v[0]!;
      uniformValues[1] = v[1]!;
      uniformValues[2] = v[8]!;
      uniformValues[3] = v[5]!;
      uniformValues[4] = uni.value1;
      uniformValues[5] = Math.max(elementRect.width, 1);
      uniformValues[6] = uni.value3;
      uniformValues[7] = Math.max(elementRect.height, 1);
      uniformValues[8] = options.color[0];
      uniformValues[9] = options.color[1];
      uniformValues[10] = options.color[2];
      uniformValues[11] = options.alpha;
      uniformValues[12] = options.boxAspect;
      uniformValues[13] = options.distanceRange;
      uniformValues[14] = options.atlasWidth;
      writeBufferFromArray(device, uniformBuffer, uniformValues);

      const pass = frame.pass;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, quadBuffer);
      pass.setVertexBuffer(1, buffer);
      pass.draw(6, glyphCount);
    },
    setGlyphData(data, count) {
      glyphData = data;
      glyphCount = count;
      instanceDirty = true;
      getDefaultEngine()?.requestFrame();
    },
    setUni(next) {
      if (next.value1 !== undefined) uni.value1 = next.value1;
      if (next.value2 !== undefined) uni.value2 = next.value2;
      if (next.value3 !== undefined) uni.value3 = next.value3;
      if (next.value4 !== undefined) uni.value4 = next.value4;
      getDefaultEngine()?.requestFrame();
    },
    destroy() {
      program.destroy();
      quadBuffer.destroy();
      uniformBuffer.destroy();
      instanceBuffer?.destroy();
      instanceBuffer = null;
      bindGroup = null;
    },
  };
}
