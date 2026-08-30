/**
 * Shared WebGPU fullscreen-pass helpers. Not a public import.
 *
 * How to use: the post chain (processor-webgpu) and the mouse trail
 * (inputs/gpu-mousetrail) both run uniform+sampler+texture fullscreen passes;
 * this module owns the bind-group layout, the linear/clamp sampler, and the
 * shared WGSL vertex/noise snippets so neither file carries its own copy.
 */

import { GPU_SHADER_STAGE, type GpuDevice, type GpuSampler } from "../engine/gpu-api";

/**
 * WGSL preamble for a fullscreen pass: the three bindings (uniforms, sampler,
 * texture — the caller names the texture) plus the fullscreen-triangle vertex
 * entry. The caller prepends its own `struct Uni`.
 */
export function wgslFullscreenPreamble(textureName: string) {
  return `@group(0) @binding(0) var<uniform> uUni: Uni;
@group(0) @binding(1) var uSampler: sampler;
@group(0) @binding(2) var ${textureName}: texture_2d<f32>;

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
  // Top-origin uv: matches the framebuffer row order, so passes never flip.
  out.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return out;
}
`;
}

/** hash12 + valueNoise, shared by the trail paint/grow WGSL shaders. */
export const WGSL_NOISE = `fn hash12(p: vec2f) -> f32 {
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

/** Uniform buffer + filtering sampler + float texture, all fragment-visible. */
export function createFullscreenBindGroupLayout(device: GpuDevice, label: string) {
  return device.createBindGroupLayout({
    label,
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
}

export function createLinearClampSampler(device: GpuDevice, label: string): GpuSampler {
  return device.createSampler({
    label,
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
}
