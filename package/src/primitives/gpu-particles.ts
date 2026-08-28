/**
 * WebGPU particle renderer. Not a public import.
 *
 * How to use: ParticlesManager constructs this when frame.backend is "webgpu".
 * WebGPU has no gl_PointSize, so each particle is an instanced unit quad sized
 * in device pixels; the fragment reproduces the WebGL2 soft-edge disc falloff.
 *
 * Docs: docs/site-patterns.md
 */

import type { EngineFrame } from "../engine/engine";
import {
  getGpuFrame,
  sceneDepthStencil,
  GPU_BUFFER_USAGE,
  type GpuBindGroup,
  type GpuBuffer,
} from "../engine/gpu-api";
import {
  compileGpuPipeline,
  createStaticBuffer,
  createUniformBuffer,
  writeBufferFromArray,
  type GpuProgram,
} from "../shaders/gpu-compile";
import type { ParticlesOptions } from "./particles";

export type GpuParticlesRenderer = {
  render: (frame: EngineFrame) => void;
  setPositions: (positions: Float32Array) => void;
  destroy: () => void;
};

const PARTICLE_WGSL = `struct Uni {
  color: vec4f,
  params: vec4f,
}

@group(0) @binding(0) var<uniform> uUni: Uni;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
}

@vertex
fn vsMain(@location(0) aCorner: vec2f, @location(1) aPosition: vec2f) -> VsOut {
  let size = max(uUni.params.x, 1.0);
  let resolution = max(uUni.params.yz, vec2f(1.0, 1.0));
  // gl_PointSize spans "size" device pixels across, so a corner sits half of
  // that away from the centre: size / resolution in NDC units.
  let offset = aCorner * size / resolution;
  var out: VsOut;
  out.position = vec4f(aPosition + offset, 0.0, 1.0);
  out.local = aCorner;
  return out;
}

@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  let size = max(uUni.params.x, 1.0);
  let dist = length(in.local);
  let alpha = uUni.color.w * (1.0 - smoothstep(1.0 - (2.0 / size), 1.0, dist));
  return vec4f(uUni.color.rgb * alpha, alpha);
}
`;

/** Two triangles covering [-1, 1]², matching gl_PointCoord's extent. */
const QUAD_CORNERS = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  -1, 1,
  1, -1,
  1, 1,
]);

const VERTEX_BUFFERS = [
  {
    arrayStride: 8,
    stepMode: "vertex",
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
  },
  {
    arrayStride: 8,
    stepMode: "instance",
    attributes: [{ shaderLocation: 1, offset: 0, format: "float32x2" }],
  },
];

export function createGpuParticlesRenderer(
  options: ParticlesOptions,
): GpuParticlesRenderer {
  const gpu = getGpuFrame();
  if (!gpu) {
    throw new Error("WebGPU frame context is missing; cannot create GPU particles.");
  }

  const { device, format } = gpu;
  const program: GpuProgram = compileGpuPipeline(device, PARTICLE_WGSL, format, "particles", {
    vertexBuffers: VERTEX_BUFFERS,
    depthStencil: sceneDepthStencil(),
  });

  const cornerBuffer = createStaticBuffer(
    device,
    QUAD_CORNERS,
    GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    "particles-corners",
  );
  const uniformBuffer = createUniformBuffer(device, "particles-uni");
  const uniformValues = new Float32Array(8);

  let positions = options.positions;
  let count = Math.floor(positions.length / 2);
  let instanceBuffer: GpuBuffer | null = null;
  let instanceCapacity = 0;
  let instanceDirty = true;
  let bindGroup: GpuBindGroup | null = null;

  const ensureInstanceBuffer = () => {
    const byteLength = Math.max(8, positions.byteLength);
    if (instanceBuffer && instanceCapacity >= byteLength) return instanceBuffer;
    instanceBuffer?.destroy();
    instanceBuffer = device.createBuffer({
      label: "particles-instances",
      size: byteLength,
      usage: GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    });
    instanceCapacity = byteLength;
    instanceDirty = true;
    return instanceBuffer;
  };

  return {
    render(nextFrame) {
      const frame = getGpuFrame();
      if (!frame || count === 0) return;
      const pipeline = program.poll();
      if (!pipeline) return;

      if (!bindGroup) {
        bindGroup = device.createBindGroup({
          label: "particles-bind",
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
        });
      }

      const buffer = ensureInstanceBuffer();
      if (instanceDirty) {
        device.queue.writeBuffer(buffer, 0, positions);
        instanceDirty = false;
      }

      const canvas = nextFrame.canvas;
      const cssWidth = canvas.getBoundingClientRect().width;
      const dpr = cssWidth > 0 ? canvas.width / cssWidth : window.devicePixelRatio || 1;
      const color = options.color ?? [1, 1, 1, 1];
      uniformValues[0] = color[0];
      uniformValues[1] = color[1];
      uniformValues[2] = color[2];
      uniformValues[3] = color[3];
      uniformValues[4] = (options.size ?? 2) * dpr;
      uniformValues[5] = Math.max(1, canvas.width);
      uniformValues[6] = Math.max(1, canvas.height);
      writeBufferFromArray(device, uniformBuffer, uniformValues);

      const pass = frame.pass;
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.setVertexBuffer(1, buffer);
      pass.draw(6, count);
    },
    setPositions(next) {
      positions = next;
      count = Math.floor(next.length / 2);
      instanceDirty = true;
    },
    destroy() {
      program.destroy();
      cornerBuffer.destroy();
      uniformBuffer.destroy();
      instanceBuffer?.destroy();
      instanceBuffer = null;
      bindGroup = null;
    },
  };
}
