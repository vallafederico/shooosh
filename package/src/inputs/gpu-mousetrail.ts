/**
 * WebGPU mouse trail. Not a public import.
 *
 * How to use: MouseTrail loads this when the engine backend is "webgpu" and
 * drives it from the engine pre-render hook, so the trail ping-pong runs before
 * the scene pass and does not force the offscreen post path.
 *
 * The trail texture is top-origin, matching `vUv` in every WGSL shader: sample
 * it with `textureSample(uTexture, uSampler, vUv)`.
 *
 * Docs: docs/api.md
 */

import {
  GPU_SHADER_STAGE,
  GPU_TEXTURE_USAGE,
  type GpuBindGroup,
  type GpuBuffer,
  type GpuCommandEncoder,
  type GpuDevice,
  type GpuSampler,
  type GpuTexture,
  type GpuTextureView,
} from "../engine/gpu-api";
import { compileGpuPipeline, type GpuProgram } from "../shaders/gpu-compile";

const TRAIL_FORMAT = "rgba8unorm";
const UNIFORM_FLOATS = 16;

export type GpuTrailParams = {
  resolutionScale: number;
  fade: number;
  radius: number;
  strength: number;
  cutoff: number;
  growth: number;
  dissipate: number;
};

export type GpuTrailFrameState = {
  mouseX: number;
  mouseY: number;
  prevX: number;
  prevY: number;
  speed: number;
  size: number;
  timeSeconds: number;
};

export type GpuTrailTarget = {
  texture: GpuTexture;
  view: GpuTextureView;
  width: number;
  height: number;
};

export type GpuMouseTrail = {
  update: (
    device: GpuDevice,
    encoder: GpuCommandEncoder,
    canvas: HTMLCanvasElement,
    state: GpuTrailFrameState,
  ) => void;
  getTarget: () => GpuTrailTarget | null;
  getSampler: () => GpuSampler | null;
  destroy: () => void;
};

const PREAMBLE = `struct Uni {
  mouse: vec4f,
  frame: vec4f,
  brush: vec4f,
  flow: vec4f,
}

@group(0) @binding(0) var<uniform> uUni: Uni;
@group(0) @binding(1) var uSampler: sampler;
@group(0) @binding(2) var uPrev: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) index: u32) -> VsOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = corners[index];
  var out: VsOut;
  out.position = vec4f(p, 0.0, 1.0);
  // Top-origin uv so a write at uv X reads back at uv X on the next pass.
  out.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return out;
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash12(i + vec2f(0.0, 0.0));
  let b = hash12(i + vec2f(1.0, 0.0));
  let c = hash12(i + vec2f(0.0, 1.0));
  let d = hash12(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const PAINT_WGSL = `${PREAMBLE}
fn distanceToSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let ab = b - a;
  let l2 = dot(ab, ab);
  if (l2 <= 1e-6) {
    return length(p - a);
  }
  let t = clamp(dot(p - a, ab) / l2, 0.0, 1.0);
  return length(p - (a + t * ab));
}

fn fbm(p0: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var p = p0;
  let m = mat2x2f(1.6, 1.2, -1.2, 1.6);
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * valueNoise(p);
    p = m * p;
    a = a * 0.5;
  }
  return v;
}

@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  let fade = uUni.frame.z;
  let radius = uUni.frame.w;
  let strength = uUni.brush.x;
  let cutoff = uUni.brush.y;
  let size = uUni.brush.w;
  let time = uUni.flow.x;

  let prev = textureSample(uPrev, uSampler, uv).rgb * fade;
  let resolution = max(uUni.frame.xy, vec2f(1.0, 1.0));
  let aspect = resolution.x / resolution.y;

  // Pointer uv is bottom-origin (shared with the WebGL2 path); flip into the
  // top-origin space this texture is stored in.
  let mouse = vec2f(uUni.mouse.x, 1.0 - uUni.mouse.y);
  let mousePrev = vec2f(uUni.mouse.z, 1.0 - uUni.mouse.w);

  let p = vec2f(uv.x * aspect, uv.y);
  let a = vec2f(mousePrev.x * aspect, mousePrev.y);
  let b = vec2f(mouse.x * aspect, mouse.y);
  let d = distanceToSegment(p, a, b);
  let segmentLen = length(b - a);
  let movementMask = smoothstep(0.00025, 0.0015, segmentLen);
  let speedCurve = clamp(size, 0.0, 1.0);
  let dynamicRadius = mix(radius, radius * 18.0, speedCurve);
  let intensity = movementMask * strength;

  // Organic edge variation using warped fBm (avoids a blocky hash look).
  let baseNoiseUv = uv * vec2f(7.0, 4.8) + vec2f(time * 0.35, -time * 0.22);
  let warpX = fbm(baseNoiseUv + vec2f(1.7, 5.1));
  let warpY = fbm(baseNoiseUv + vec2f(8.3, 2.4));
  let organic = fbm(baseNoiseUv + (vec2f(warpX, warpY) - 0.5) * 1.35);
  let noisyD = d + (organic - 0.5) * 2.0 * dynamicRadius * 0.22;
  // Squared directly rather than pow(): noisyD can go negative and pow() with a
  // negative base is undefined in WGSL.
  let falloff = noisyD / max(0.0001, dynamicRadius);
  let brush = exp(-falloff * falloff * 2.0) * intensity;
  let trail = max(clamp(prev + vec3f(brush), vec3f(0.0), vec3f(1.0)) - vec3f(cutoff), vec3f(0.0));
  return vec4f(trail, 1.0);
}
`;

const GROW_WGSL = `${PREAMBLE}
@fragment
fn fsEntry(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  let resolution = max(uUni.frame.xy, vec2f(1.0, 1.0));
  let texel = 1.0 / resolution;
  let grow = clamp(uUni.flow.y, 0.0, 1.0);
  let dissipate = uUni.flow.z;
  let cutoff = uUni.brush.y;
  let time = uUni.flow.x;

  let c = textureSample(uPrev, uSampler, uv).rgb;
  let s1 = textureSample(uPrev, uSampler, uv + vec2f(texel.x, 0.0)).rgb;
  let s2 = textureSample(uPrev, uSampler, uv + vec2f(-texel.x, 0.0)).rgb;
  let s3 = textureSample(uPrev, uSampler, uv + vec2f(0.0, texel.y)).rgb;
  let s4 = textureSample(uPrev, uSampler, uv + vec2f(0.0, -texel.y)).rgb;
  let s5 = textureSample(uPrev, uSampler, uv + vec2f(texel.x, texel.y)).rgb;
  let s6 = textureSample(uPrev, uSampler, uv + vec2f(-texel.x, texel.y)).rgb;
  let s7 = textureSample(uPrev, uSampler, uv + vec2f(texel.x, -texel.y)).rgb;
  let s8 = textureSample(uPrev, uSampler, uv + vec2f(-texel.x, -texel.y)).rgb;
  let neighborMax = max(max(max(s1, s2), max(s3, s4)), max(max(s5, s6), max(s7, s8)));
  let grown = mix(c, max(c, neighborMax), grow);

  // Low-frequency animated noise so the trail dissipates unevenly.
  let n = valueNoise(uv * vec2f(5.0, 3.4) + vec2f(time * 0.18, -time * 0.12)) * 2.0 - 1.0;
  let dissipated = grown * clamp(dissipate + n * 0.04, 0.0, 1.0);
  return vec4f(max(dissipated - vec3f(cutoff), vec3f(0.0)), 1.0);
}
`;

export function createGpuMouseTrail(
  device: GpuDevice,
  params: GpuTrailParams,
): GpuMouseTrail {
  const bindGroupLayout = device.createBindGroupLayout({
    label: "trail-bind-layout",
    entries: [
      { binding: 0, visibility: GPU_SHADER_STAGE.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPU_SHADER_STAGE.FRAGMENT, sampler: { type: "filtering" } },
      {
        binding: 2,
        visibility: GPU_SHADER_STAGE.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({
    label: "trail-pipeline-layout",
    bindGroupLayouts: [bindGroupLayout],
  });
  const sampler = device.createSampler({
    label: "trail-sampler",
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const compile = (code: string, label: string): GpuProgram =>
    compileGpuPipeline(device, code, TRAIL_FORMAT, label, {
      layout: pipelineLayout,
      vertexBuffers: null,
      blend: null,
    });

  const paintProgram = compile(PAINT_WGSL, "trail-paint");
  const growProgram = compile(GROW_WGSL, "trail-grow");

  const makeBuffer = (label: string): GpuBuffer =>
    device.createBuffer({
      label,
      size: UNIFORM_FLOATS * 4,
      usage: 0x0040 | 0x0008, // UNIFORM | COPY_DST
    });
  const paintUniforms = makeBuffer("trail-paint-uni");
  const growUniforms = makeBuffer("trail-grow-uni");
  const scratch = new Float32Array(UNIFORM_FLOATS);

  let targets: GpuTrailTarget[] = [];
  let paintBind: GpuBindGroup | null = null;
  let growBind: GpuBindGroup | null = null;
  let destroyed = false;

  const releaseTargets = () => {
    targets.forEach((target) => target.texture.destroy());
    targets = [];
    paintBind = null;
    growBind = null;
  };

  /** New WebGPU textures read back as zero, so no explicit clear pass is needed. */
  const ensureTargets = (width: number, height: number) => {
    if (targets.length === 2 && targets[0]!.width === width && targets[0]!.height === height) {
      return;
    }
    releaseTargets();
    const make = (suffix: string): GpuTrailTarget => {
      const texture = device.createTexture({
        label: `trail-${suffix}`,
        size: { width, height },
        format: TRAIL_FORMAT,
        usage: GPU_TEXTURE_USAGE.RENDER_ATTACHMENT | GPU_TEXTURE_USAGE.TEXTURE_BINDING,
      });
      return { texture, view: texture.createView(), width, height };
    };
    targets = [make("a"), make("b")];
  };

  const makeBind = (label: string, buffer: GpuBuffer, view: GpuTextureView) =>
    device.createBindGroup({
      label,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: view },
      ],
    });

  return {
    update(activeDevice, encoder, canvas, state) {
      if (destroyed || activeDevice !== device) return;
      const paintPipeline = paintProgram.poll();
      const growPipeline = growProgram.poll();
      if (!paintPipeline || !growPipeline) return;

      const width = Math.max(1, Math.round(canvas.width * params.resolutionScale));
      const height = Math.max(1, Math.round(canvas.height * params.resolutionScale));
      ensureTargets(width, height);
      const read = targets[0]!;
      const write = targets[1]!;
      if (!paintBind) paintBind = makeBind("trail-paint-bind", paintUniforms, read.view);
      if (!growBind) growBind = makeBind("trail-grow-bind", growUniforms, write.view);

      scratch[0] = state.mouseX;
      scratch[1] = state.mouseY;
      scratch[2] = state.prevX;
      scratch[3] = state.prevY;
      scratch[4] = width;
      scratch[5] = height;
      scratch[6] = params.fade;
      scratch[7] = params.radius;
      scratch[8] = params.strength;
      scratch[9] = params.cutoff;
      scratch[10] = state.speed;
      scratch[11] = state.size;
      scratch[12] = state.timeSeconds;
      scratch[13] = params.growth;
      scratch[14] = params.dissipate;
      device.queue.writeBuffer(paintUniforms, 0, scratch);
      // The grow pass trims with a softer cutoff, matching the WebGL2 chain.
      scratch[9] = params.cutoff * 0.6;
      device.queue.writeBuffer(growUniforms, 0, scratch);

      const runPass = (
        label: string,
        pipeline: ReturnType<GpuProgram["poll"]>,
        bindGroup: GpuBindGroup,
        view: GpuTextureView,
      ) => {
        const pass = encoder.beginRenderPass({
          label,
          colorAttachments: [
            {
              view,
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        pass.setPipeline(pipeline!);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
      };

      runPass("trail-paint", paintPipeline, paintBind, write.view);
      runPass("trail-grow", growPipeline, growBind, read.view);
    },
    getTarget() {
      return targets[0] ?? null;
    },
    getSampler() {
      return sampler;
    },
    destroy() {
      destroyed = true;
      paintProgram.destroy();
      growProgram.destroy();
      paintUniforms.destroy();
      growUniforms.destroy();
      releaseTargets();
    },
  };
}
