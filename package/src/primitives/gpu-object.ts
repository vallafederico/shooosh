/**
 * WebGPU mesh renderer. Not a public import.
 *
 * How to use: ObjectManager constructs this when frame.backend is "webgpu".
 * Native WGSL vertex + fragment; a site fragment is `fn fsMain() -> vec4f` and
 * may read `vUv`, `vNormal`, `uUni.valuesN` and — when it names them —
 * `uEnvMap` / `uMaskMap` through `uSampler`. GLSL fragments are a WebGL2-only
 * escape hatch and fall back to the default material here.
 *
 * Depth-tests against the engine's scene depth buffer.
 *
 * Docs: docs/api.md · docs/shader-contract.md
 */

import type { EngineFrame } from "../engine/engine";
import {
  getGpuFrame,
  sceneDepthStencil,
  GPU_BUFFER_USAGE,
  GPU_TEXTURE_USAGE,
  type GpuBindGroup,
  type GpuBindGroupEntryResource,
  type GpuDevice,
  type GpuSampler,
  type GpuTextureView,
} from "../engine/gpu-api";
import type { UniWatchController } from "../engine/uni";
import {
  compileGpuPipeline,
  createStaticBuffer,
  createUniformBuffer,
  writeBufferFromArray,
  type GpuProgram,
} from "../shaders/gpu-compile";
import { isGlsl300 } from "../shaders/wgsl-wrap";
import {
  computeObjectMatrices,
  createObjectGeometry,
  createObjectMatrixScratch,
  getElementObjectPlacement,
  getScreenObjectPlacement,
  isMvpVisible,
} from "./object.utils";
import type { ObjectOptions } from "./object";

export type GpuObjectRenderer = {
  render: (frame: EngineFrame) => boolean;
  destroy: () => void;
};

type ObjectTransform = {
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
};

/** mvp (16) + model (16) + values0..3 (16) floats. */
const UNIFORM_FLOATS = 48;

const OBJECT_PREAMBLE = `struct Uni {
  mvp: mat4x4f,
  model: mat4x4f,
  values0: vec4f,
  values1: vec4f,
  values2: vec4f,
  values3: vec4f,
}

@group(0) @binding(0) var<uniform> uUni: Uni;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
}

@vertex
fn vsMain(
  @location(0) aPosition: vec3f,
  @location(1) aNormal: vec3f,
  @location(2) aUv: vec2f,
) -> VsOut {
  var out: VsOut;
  out.position = uUni.mvp * vec4f(aPosition, 1.0);
  out.normal = normalize((uUni.model * vec4f(aNormal, 0.0)).xyz);
  out.uv = aUv;
  return out;
}

var<private> vUv: vec2f;
var<private> vNormal: vec3f;
`;

const SAMPLER_BINDING = `@group(0) @binding(1) var uSampler: sampler;\n`;
const ENV_BINDING = `@group(0) @binding(2) var uEnvMap: texture_2d<f32>;\n`;
const MASK_BINDING = `@group(0) @binding(3) var uMaskMap: texture_2d<f32>;\n`;

const OBJECT_ENTRY = `
@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  vUv = in.uv;
  vNormal = in.normal;
  return fsMain();
}
`;

const DEFAULT_FRAGMENT = `fn fsMain() -> vec4f {
  return vec4f(normalize(vNormal) * 0.5 + vec3f(0.5), 1.0);
}
`;

const VERTEX_BUFFERS = [
  {
    arrayStride: 32,
    attributes: [
      { shaderLocation: 0, offset: 0, format: "float32x3" },
      { shaderLocation: 1, offset: 12, format: "float32x3" },
      { shaderLocation: 2, offset: 24, format: "float32x2" },
    ],
  },
];

/** Pick the WGSL fragment, warning when only a GLSL variant exists. */
function resolveObjectFragment(options: ObjectOptions) {
  if (options.shaders?.vertex) {
    console.warn("shooosh: custom vertex shaders are not supported by createObject.");
  }
  if (options.shaders?.fragmentGlsl) {
    console.warn(
      "shooosh: `shaders.fragmentGlsl` is a WebGL2 escape hatch; the WebGPU object falls back to the default material.",
    );
  }
  const raw = (options.shaders?.fragment ?? options.shaders?.wgsl ?? "").trim();
  if (!raw) return DEFAULT_FRAGMENT;
  if (isGlsl300(raw)) {
    console.warn(
      "shooosh: GLSL #version 300 es is ignored on WebGPU. Using the default object material.",
    );
    return DEFAULT_FRAGMENT;
  }
  return raw;
}

/**
 * loadTexture handles arrive either as the TextureHandle itself (what the
 * WebGL2 path reads) or as the whole loader result. Accept both.
 */
function resolveMapView(
  handle: { texture?: unknown; createView?: () => unknown } | null | undefined,
  label: string,
): GpuTextureView | null {
  if (!handle) return null;
  const inner =
    typeof handle.createView === "function"
      ? handle
      : (handle.texture as { backend?: string; createView?: () => unknown } | undefined);
  if (!inner || typeof inner.createView !== "function") return null;
  const backend = (inner as { backend?: string }).backend;
  if (backend && backend !== "webgpu") {
    console.warn(
      `shooosh: ignoring a WebGL2 ${label} on the WebGPU backend. Load it after the engine starts.`,
    );
    return null;
  }
  return (inner.createView() ?? null) as GpuTextureView | null;
}

/** 1×1 stand-in so a shader can name uEnvMap / uMaskMap without supplying one. */
function createSolidView(
  device: GpuDevice,
  rgba: [number, number, number, number],
  label: string,
) {
  const texture = device.createTexture({
    label,
    size: { width: 1, height: 1 },
    format: "rgba8unorm",
    usage: GPU_TEXTURE_USAGE.TEXTURE_BINDING | GPU_TEXTURE_USAGE.COPY_DST,
  });
  device.queue.writeTexture?.(
    { texture },
    new Uint8Array(rgba),
    { bytesPerRow: 4 },
    { width: 1, height: 1 },
  );
  return { texture, view: texture.createView() };
}

/** Interleave geometry into the fixed pos3 + nrm3 + uv2 layout the WGSL expects. */
function toInterleavedVertices(vertices: Float32Array, stride: 6 | 8) {
  if (stride === 8) return vertices;
  const count = Math.floor(vertices.length / 6);
  const out = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    out.set(vertices.subarray(i * 6, i * 6 + 6), i * 8);
  }
  return out;
}

export function createGpuObjectRenderer(
  element: HTMLElement | null,
  options: ObjectOptions,
  uni: UniWatchController,
  transform: ObjectTransform,
): GpuObjectRenderer {
  const gpu = getGpuFrame();
  if (!gpu) {
    throw new Error("WebGPU frame context is missing; cannot create a GPU object.");
  }

  const { device, format } = gpu;
  const useScreenPlacement = element == null;
  const screenPlacement = useScreenPlacement
    ? (options.placement ?? { centerX: 0, centerY: 0, scale: 1 })
    : undefined;

  const geometry = createObjectGeometry(options.shape ?? "cube");
  const fragment = resolveObjectFragment(options);
  const usesEnvMap = /\buEnvMap\b/.test(fragment);
  const usesMaskMap = /\buMaskMap\b/.test(fragment);
  const usesSampler = usesEnvMap || usesMaskMap;

  const code = [
    OBJECT_PREAMBLE,
    usesSampler ? SAMPLER_BINDING : "",
    usesEnvMap ? ENV_BINDING : "",
    usesMaskMap ? MASK_BINDING : "",
    fragment.replace(/\r/g, "").replace(/@fragment\s+/g, ""),
    OBJECT_ENTRY,
  ].join("");

  const program: GpuProgram = compileGpuPipeline(device, code, format, "object", {
    vertexBuffers: VERTEX_BUFFERS,
    depthStencil: sceneDepthStencil({ write: true, compare: "less" }),
    // Opaque mesh — skip the plane's premultiplied blend.
    blend: null,
    // No back-face culling: WebGPU's front-face winding is mirrored against
    // WebGL2's, and the depth buffer already resolves overlap correctly.
    primitive: { topology: "triangle-list", cullMode: "none" },
  });

  const vertexBuffer = createStaticBuffer(
    device,
    toInterleavedVertices(geometry.vertices, geometry.vertexStride),
    GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    "object-vertex",
  );
  const indexBuffer = createStaticBuffer(
    device,
    geometry.indices,
    GPU_BUFFER_USAGE.INDEX | GPU_BUFFER_USAGE.COPY_DST,
    "object-index",
  );
  const indexFormat = geometry.indices instanceof Uint32Array ? "uint32" : "uint16";
  const uniformBuffer = createUniformBuffer(device, "object-uni", UNIFORM_FLOATS * 4);
  const uniformValues = new Float32Array(UNIFORM_FLOATS);
  const matrixScratch = createObjectMatrixScratch();

  let sampler: GpuSampler | null = null;
  let fallbackWhite: ReturnType<typeof createSolidView> | null = null;
  let fallbackBlack: ReturnType<typeof createSolidView> | null = null;
  let envView: GpuTextureView | null = null;
  let maskView: GpuTextureView | null = null;

  if (usesSampler) {
    sampler = device.createSampler({
      label: "object-sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
  }
  if (usesEnvMap) {
    envView = resolveMapView(options.envMap, "envMap");
    if (!envView) {
      fallbackWhite = createSolidView(device, [255, 255, 255, 255], "object-env-fallback");
      envView = fallbackWhite.view;
    }
  }
  if (usesMaskMap) {
    maskView = resolveMapView(options.maskMap, "maskMap");
    if (!maskView) {
      fallbackBlack = createSolidView(device, [0, 0, 0, 255], "object-mask-fallback");
      maskView = fallbackBlack.view;
    }
  }

  let uniValues = uni.toFloat32(16);
  const unsubscribeUni = uni.subscribe(() => {
    uniValues = uni.toFloat32(16);
  });
  let bindGroup: GpuBindGroup | null = null;

  return {
    render(nextFrame) {
      const frame = getGpuFrame();
      if (!frame) return false;
      const pipeline = program.poll();
      if (!pipeline) return false;

      const placement = useScreenPlacement
        ? getScreenObjectPlacement(nextFrame.canvas, screenPlacement)
        : getElementObjectPlacement(element!, nextFrame.canvas);
      if (!placement.isVisible) return false;

      const { model, mvp } = computeObjectMatrices({
        placement,
        transform,
        camera: options.camera,
        canvas: nextFrame.canvas,
        zeroToOneDepth: true,
        scratch: matrixScratch,
      });

      const cullingEnabled = !useScreenPlacement && (options.frustumCulling ?? true);
      if (cullingEnabled && !isMvpVisible(mvp)) return false;

      if (!bindGroup) {
        const entries: Array<{ binding: number; resource: GpuBindGroupEntryResource }> = [
          { binding: 0, resource: { buffer: uniformBuffer } },
        ];
        if (sampler) entries.push({ binding: 1, resource: sampler });
        if (envView) entries.push({ binding: 2, resource: envView });
        if (maskView) entries.push({ binding: 3, resource: maskView });
        bindGroup = device.createBindGroup({
          label: "object-bind",
          layout: pipeline.getBindGroupLayout(0),
          entries,
        });
      }

      uniformValues.set(mvp, 0);
      uniformValues.set(model, 16);
      uniformValues.set(uniValues, 32);
      writeBufferFromArray(device, uniformBuffer, uniformValues);

      const pass = frame.pass;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.setIndexBuffer(indexBuffer, indexFormat);
      pass.drawIndexed(geometry.indices.length);
      return true;
    },
    destroy() {
      unsubscribeUni();
      program.destroy();
      vertexBuffer.destroy();
      indexBuffer.destroy();
      uniformBuffer.destroy();
      fallbackWhite?.texture.destroy();
      fallbackBlack?.texture.destroy();
      bindGroup = null;
    },
  };
}
