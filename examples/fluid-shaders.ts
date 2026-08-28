/**
 * Fluid compute + display WGSL — owned by examples, not the package.
 *
 * How to use:
 *   const gpu = createCompute(engine)
 *   createFluidSim(gpu!, { shaders: fluidShaders, simScale: 0.5 })
 *
 * Tweak look here (advect / splat / display). Pass order lives in fluid-sim.ts.
 */

export const FLUID_COMMON = /* wgsl */ `
struct Params {
  texel_size: vec2f,
  dt: f32,
  dissipation: f32,
  point: vec2f,
  radius: f32,
  soft: f32,
  force: vec2f,
  _pad0: vec2f,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;
`

export const ADVECT_WGSL = /* wgsl */ `
${FLUID_COMMON}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

fn sample_field(tex: texture_2d<f32>, uv: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(tex));
  let coord = clamp(uv * size - 0.5, vec2f(0.0), size - 1.0);
  let i = vec2i(coord);
  let f = fract(coord);
  let c00 = textureLoad(tex, i, 0);
  let c10 = textureLoad(tex, min(i + vec2i(1, 0), vec2i(size) - 1), 0);
  let c01 = textureLoad(tex, min(i + vec2i(0, 1), vec2i(size) - 1), 0);
  let c11 = textureLoad(tex, min(i + vec2i(1, 1), vec2i(size) - 1), 0);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dst);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) * params.texel_size;
  let velocity = textureLoad(vel, vec2i(id.xy), 0).xy;
  let coord = uv - params.dt * velocity * params.texel_size;
  var value = sample_field(src, clamp(coord, vec2f(0.0), vec2f(1.0)));
  value = value * params.dissipation;
  textureStore(dst, vec2i(id.xy), value);
}
`

export const SPLAT_WGSL = /* wgsl */ `
${FLUID_COMMON}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dst);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let uv = (vec2f(id.xy) + 0.5) * params.texel_size;
  var base = textureLoad(src, vec2i(id.xy), 0);
  let d = distance(uv, params.point);
  let influence = exp(-d * d / max(params.radius, 1e-6));
  base = base + vec4f(params.force * influence, 0.0, 0.0) + params.color * influence;
  textureStore(dst, vec2i(id.xy), base);
}
`

export const DIVERGENCE_WGSL = /* wgsl */ `
@group(0) @binding(0) var vel: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dst);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let w = i32(size.x) - 1;
  let h = i32(size.y) - 1;
  let L = textureLoad(vel, vec2i(max(x - 1, 0), y), 0).x;
  let R = textureLoad(vel, vec2i(min(x + 1, w), y), 0).x;
  let B = textureLoad(vel, vec2i(x, max(y - 1, 0)), 0).y;
  let T = textureLoad(vel, vec2i(x, min(y + 1, h)), 0).y;
  let div = 0.5 * ((R - L) + (T - B));
  textureStore(dst, vec2i(x, y), vec4f(div, 0.0, 0.0, 1.0));
}
`

export const PRESSURE_WGSL = /* wgsl */ `
@group(0) @binding(0) var pressure: texture_2d<f32>;
@group(0) @binding(1) var divergence: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dst);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let w = i32(size.x) - 1;
  let h = i32(size.y) - 1;
  let L = textureLoad(pressure, vec2i(max(x - 1, 0), y), 0).x;
  let R = textureLoad(pressure, vec2i(min(x + 1, w), y), 0).x;
  let B = textureLoad(pressure, vec2i(x, max(y - 1, 0)), 0).x;
  let T = textureLoad(pressure, vec2i(x, min(y + 1, h)), 0).x;
  let div = textureLoad(divergence, vec2i(x, y), 0).x;
  let p = (L + R + B + T - div) * 0.25;
  textureStore(dst, vec2i(x, y), vec4f(p, 0.0, 0.0, 1.0));
}
`

export const GRADIENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var vel: texture_2d<f32>;
@group(0) @binding(1) var pressure: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dst);
  if (id.x >= size.x || id.y >= size.y) { return; }
  let x = i32(id.x);
  let y = i32(id.y);
  let w = i32(size.x) - 1;
  let h = i32(size.y) - 1;
  let L = textureLoad(pressure, vec2i(max(x - 1, 0), y), 0).x;
  let R = textureLoad(pressure, vec2i(min(x + 1, w), y), 0).x;
  let B = textureLoad(pressure, vec2i(x, max(y - 1, 0)), 0).x;
  let T = textureLoad(pressure, vec2i(x, min(y + 1, h)), 0).x;
  var v = textureLoad(vel, vec2i(x, y), 0);
  v = vec4f(v.xy - 0.5 * vec2f(R - L, T - B), 0.0, 1.0);
  textureStore(dst, vec2i(x, y), v);
}
`

export const CLEAR_WGSL = /* wgsl */ `
@group(0) @binding(0) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(dst);
  if (id.x >= size.x || id.y >= size.y) { return; }
  textureStore(dst, vec2i(id.xy), vec4f(0.0));
}
`

export const DISPLAY_WGSL = /* wgsl */ `
@group(0) @binding(0) var dye: texture_2d<f32>;

struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vi: u32) -> VsOut {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var out: VsOut;
  out.position = vec4f(pos[vi], 0.0, 1.0);
  out.uv = pos[vi] * 0.5 + 0.5;
  out.uv.y = 1.0 - out.uv.y;
  return out;
}

@fragment
fn fsMain(input: VsOut) -> @location(0) vec4f {
  let ink = vec3f(0.047, 0.047, 0.043);
  let size = vec2f(textureDimensions(dye));
  let coord = clamp(input.uv * size, vec2f(0.0), size - 1.0);
  let sample = textureLoad(dye, vec2i(coord), 0);
  let dyeRgb = max(sample.rgb, vec3f(0.0));
  let amount = clamp(max(max(dyeRgb.r, dyeRgb.g), dyeRgb.b) * 1.25, 0.0, 1.0);
  let color = mix(ink, dyeRgb, amount);
  return vec4f(color, 1.0);
}
`

/** Pack passed into createFluidSim({ shaders }). */
export type FluidShaders = {
  advect: string
  splat: string
  divergence: string
  pressure: string
  gradient: string
  clear: string
  display: string
}

export const fluidShaders: FluidShaders = {
  advect: ADVECT_WGSL,
  splat: SPLAT_WGSL,
  divergence: DIVERGENCE_WGSL,
  pressure: PRESSURE_WGSL,
  gradient: GRADIENT_WGSL,
  clear: CLEAR_WGSL,
  display: DISPLAY_WGSL,
}
