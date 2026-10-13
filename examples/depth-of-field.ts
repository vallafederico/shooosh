import { createPostProcessor, type PostProcessor } from "shooosh"

/**
 * Depth of field, darkening with distance, a neutral grade and film grain for object
 * scenes, in one post effect of three passes. Copy set and limits: depth-of-field.md.
 *
 * Shooosh post effects can't read the depth buffer, so object shaders carry depth in
 * alpha (objects draw unblended, so alpha is a free channel): `0.5 + 0.5 · near / range`,
 * where `near` is metres in front of the scene's centre; the background is cleared to
 * alpha 0. See `DEPTH_ALPHA_WGSL` for the object side.
 *
 * Passes (one shader, branching on `passIndex`; an effect runs one shader per pass):
 *   0  prepare: grade, haze towards the background (more with distance), then darken each
 *      pixel by its depth, once (per-pixel work inside
 *      the blur's tap loop costs taps × the work: it was the whole frame at 5K)
 *   1  blur across, 2  blur down + grain. A gaussian of the pixel's own blur; each pixel
 *      takes only the taps it needs (in focus: none). A neighbour counts only as far as
 *      its own blur spreads it (gather as scatter), so sharp objects never halo onto the
 *      background; objects never gather the background, or thin things hollow out.
 */
const TAPS = 6

export interface DepthLook {
  /** Largest blur radius, CSS pixels (0: no blur). */
  radius: number
  /** Metres either side of the scene's centre that alpha spans (match the object side). */
  range: number
  /** In focus `focus` metres in front of the centre; sharp within `sharp`, fully blurred `ramp` beyond. */
  focus: number
  sharp: number
  ramp: number
  /** Darkening: `exp((z − bright) · fade)` held between `darkest` and `brightest` (z: metres in front). */
  fade: number
  bright: number
  darkest: number
  brightest: number
  /** Grade amount (0–1), saturation, contrast (a curve with fixed ends). */
  grade: number
  saturation: number
  contrast: number
  /**
   * Haze: objects drawn towards the background colour (`createDepthOfField`'s
   * `background`), `haze` at their nearest, growing by `hazeRate` per metre behind
   * `bright`, at most `hazeMax`.
   */
  haze: number
  hazeRate: number
  hazeMax: number
  /** Film grain strength (0 off). */
  grain: number
}

export const DEFAULT_DEPTH_LOOK: DepthLook = {
  radius: 5, range: 1, focus: 0.2, sharp: 0.04, ramp: 0.45,
  fade: 2.7, bright: 0.15, darkest: 0.2, brightest: 1,
  grade: 1, saturation: 0.82, contrast: 0.92, haze: 0.1, hazeRate: 0.6, hazeMax: 0.6, grain: 0.035,
}

/**
 * The object side, for an object `fsMain`: return `vec4f(colour, depthAlpha(near, range))`.
 * Per pixel needs the fragment's world position (`vPosition`, proposed upstream: see
 * docs/proposals/object-scenes.md §1); on stock shooosh, pass each object's own `near`
 * (its centre's distance, computed in JS) through a uniform: the blur is then per object.
 */
export const DEPTH_ALPHA_WGSL = /* wgsl */ `
// Metres in front of the scene's centre, the camera on +Z at \`distance\` (per pixel).
fn nearOf(position: vec3f, distance: f32) -> f32 {
  return distance - length(position - vec3f(0.0, 0.0, distance));
}

fn depthAlpha(near: f32, range: f32) -> f32 {
  return clamp(0.5 + 0.5 * near / range, 0.004, 1.0);
}
`

// Uniforms: values0 = radius (device px), range, sharp, ramp; values1 = fade, darkest,
// brightest, bright; values2 = focus, grain, grade, haze; values3 = saturation, contrast,
// haze rate, haze max. The background colour (sRGB) is written into the shader.
const wgsl = (background: string) => /* wgsl */ `
fn depthOf(a: f32, uni: Uni) -> f32 {
  return (a * 2.0 - 1.0) * uni.values0.y;
}

fn blurOf(a: f32, uni: Uni) -> f32 {
  let object: f32 = clamp((abs(depthOf(a, uni) - uni.values2.x) - uni.values0.z) / max(uni.values0.w, 0.0001), 0.0, 1.0);
  return mix(1.0, object, step(0.002, a));
}

fn reaches(tap: f32, centre: f32, offset: f32, uni: Uni) -> f32 {
  let object: f32 = clamp(blurOf(tap, uni) * uni.values0.x * 1.25 - offset + 1.0, 0.0, 1.0);
  return mix(1.0 - step(0.002, centre), object, step(0.002, tap));
}

fn shadeOf(a: f32, uni: Uni) -> f32 {
  let z: f32 = depthOf(a, uni);
  return mix(1.0, clamp(exp((z - uni.values1.w) * uni.values1.x), uni.values1.y, uni.values1.z), step(0.002, a));
}

fn graded(c: vec3f, uni: Uni) -> vec3f {
  let luma: f32 = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  var g: vec3f = mix(vec3f(luma), c, uni.values3.x);
  let x: vec3f = clamp(g, vec3f(0.0), vec3f(1.0));
  let soft: vec3f = vec3f(0.5) - sin(asin(vec3f(1.0) - 2.0 * x) / 3.0);
  let hard: vec3f = x * x * (vec3f(3.0) - 2.0 * x);
  g = mix(mix(x, soft, max(1.0 - uni.values3.y, 0.0) * 2.0), hard, max(uni.values3.y - 1.0, 0.0) * 2.0);
  // Darks keep their brightness exactly, so whatever fades into the background still does.
  let keep: f32 = 1.0 - smoothstep(0.12, 0.35, luma);
  g = mix(g, g * (luma / max(dot(g, vec3f(0.2126, 0.7152, 0.0722)), 0.0001)), keep);
  return mix(c, max(g, vec3f(0.0)), uni.values2.z);
}

fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f {
  if (uni.passIndex < 0.5) {
    // Objects graded then darkened; the background exactly as cleared.
    let object: f32 = step(0.002, color.a);
    let haze: f32 = clamp(uni.values2.w + (uni.values1.w - depthOf(color.a, uni)) * uni.values3.z, uni.values2.w, uni.values3.w);
    let hazed: vec3f = mix(graded(color.rgb, uni), vec3f(${background}), haze);
    return vec4f(mix(color.rgb, hazed, object) * shadeOf(color.a, uni), color.a);
  }
  let across: f32 = 1.0 - step(1.5, uni.passIndex);
  let direction: vec2f = vec2f(across, 1.0 - across) / resolution;
  let sigma: f32 = max(blurOf(color.a, uni) * uni.values0.x * 0.5, 0.001);
  let count: f32 = min(f32(${TAPS}), ceil(sigma * 2.0)) * step(0.3, sigma);
  let stride: f32 = sigma * 2.5 / max(count, 1.0);
  var sum: vec3f = color.rgb;
  var weight: f32 = 1.0;
  for (var i: i32 = 1; i <= ${TAPS}; i = i + 1) {
    if (f32(i) > count) {
      break;
    }
    let offset: f32 = f32(i) * stride;
    let falloff: f32 = exp(-0.5 * (offset / sigma) * (offset / sigma));
    let a: vec4f = textureSampleLevel(uTexture, uSampler, uv + direction * offset, 0.0);
    let b: vec4f = textureSampleLevel(uTexture, uSampler, uv - direction * offset, 0.0);
    let wa: f32 = falloff * reaches(a.a, color.a, offset, uni);
    let wb: f32 = falloff * reaches(b.a, color.a, offset, uni);
    sum = sum + a.rgb * wa + b.rgb * wb;
    weight = weight + wa + wb;
  }
  let last: f32 = 1.0 - across;
  let seed: vec2f = uv * resolution + vec2f(uni.time * 61.0, uni.time * 37.0);
  let grain: f32 = (fract(sin(dot(seed, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5) * uni.values2.y * last;
  return vec4f(sum / weight + vec3f(grain), mix(color.a, 1.0, last));
}
`

const glsl = (background: string) => /* glsl */ `
float depthOf(float a, vec4 uni[4]) {
  return (a * 2.0 - 1.0) * uni[0].y;
}

float blurOf(float a, vec4 uni[4]) {
  float object = clamp((abs(depthOf(a, uni) - uni[2].x) - uni[0].z) / max(uni[0].w, 0.0001), 0.0, 1.0);
  return mix(1.0, object, step(0.002, a));
}

float reaches(float tap, float centre, float offset, vec4 uni[4]) {
  float object = clamp(blurOf(tap, uni) * uni[0].x * 1.25 - offset + 1.0, 0.0, 1.0);
  return mix(1.0 - step(0.002, centre), object, step(0.002, tap));
}

float shadeOf(float a, vec4 uni[4]) {
  float z = depthOf(a, uni);
  return mix(1.0, clamp(exp((z - uni[1].w) * uni[1].x), uni[1].y, uni[1].z), step(0.002, a));
}

vec3 graded(vec3 c, vec4 uni[4]) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 g = mix(vec3(luma), c, uni[3].x);
  vec3 x = clamp(g, vec3(0.0), vec3(1.0));
  vec3 soft = vec3(0.5) - sin(asin(vec3(1.0) - 2.0 * x) / 3.0);
  vec3 hard = x * x * (vec3(3.0) - 2.0 * x);
  g = mix(mix(x, soft, max(1.0 - uni[3].y, 0.0) * 2.0), hard, max(uni[3].y - 1.0, 0.0) * 2.0);
  float keep = 1.0 - smoothstep(0.12, 0.35, luma);
  g = mix(g, g * (luma / max(dot(g, vec3(0.2126, 0.7152, 0.0722)), 0.0001)), keep);
  return mix(c, max(g, vec3(0.0)), uni[2].z);
}

vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  if (uPassIndex < 0.5) {
    float object = step(0.002, color.a);
    float haze = clamp(uni[2].w + (uni[1].w - depthOf(color.a, uni)) * uni[3].z, uni[2].w, uni[3].w);
    vec3 hazed = mix(graded(color.rgb, uni), vec3(${background}), haze);
    return vec4(mix(color.rgb, hazed, object) * shadeOf(color.a, uni), color.a);
  }
  float across = 1.0 - step(1.5, uPassIndex);
  vec2 direction = vec2(across, 1.0 - across) / resolution;
  float sigma = max(blurOf(color.a, uni) * uni[0].x * 0.5, 0.001);
  float count = min(float(${TAPS}), ceil(sigma * 2.0)) * step(0.3, sigma);
  float stride = sigma * 2.5 / max(count, 1.0);
  vec3 sum = color.rgb;
  float weight = 1.0;
  for (int i = 1; i <= ${TAPS}; i++) {
    if (float(i) > count) break;
    float offset = float(i) * stride;
    float falloff = exp(-0.5 * (offset / sigma) * (offset / sigma));
    vec4 a = textureLod(uTexture, uv + direction * offset, 0.0);
    vec4 b = textureLod(uTexture, uv - direction * offset, 0.0);
    float wa = falloff * reaches(a.a, color.a, offset, uni);
    float wb = falloff * reaches(b.a, color.a, offset, uni);
    sum += a.rgb * wa + b.rgb * wb;
    weight += wa + wb;
  }
  float last = 1.0 - across;
  vec2 seed = uv * resolution + vec2(uTime * 61.0, uTime * 37.0);
  float grain = (fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uni[2].y * last;
  return vec4(sum / weight + vec3(grain), mix(color.a, 1.0, last));
}
`

function uniforms(look: DepthLook, pixelRatio: number) {
  return {
    value1: look.radius * pixelRatio, value2: look.range, value3: look.sharp, value4: look.ramp,
    value5: look.fade, value6: look.darkest, value7: look.brightest, value8: look.bright,
    value9: look.focus, value10: look.grain, value11: look.grade, value12: look.haze,
    value13: look.saturation, value14: look.contrast, value15: look.hazeRate, value16: look.hazeMax,
  }
}

/**
 * Adds the effect after the scene's `init()`; retain the returned `post` with the scene
 * (`scene.retain(post)`) or destroy it yourself. Clear the scene with alpha 0, in the
 * same `background` colour (sRGB 0–1) the haze draws objects towards.
 */
export function createDepthOfField(
  look: DepthLook = DEFAULT_DEPTH_LOOK,
  background: [number, number, number] = [0.0706, 0.0745, 0.0824],
  pixelRatio = Math.min(devicePixelRatio, 2),
): { post: PostProcessor; set: (next: DepthLook) => void } {
  const colour = background.map((value) => value.toFixed(4)).join(", ")
  const post = createPostProcessor()
  const id = post.addFragmentEffect({ id: "depth-of-field", passes: 3, fragmentShaderWgsl: wgsl(colour), fragmentShader: glsl(colour), uni: uniforms(look, pixelRatio) })
  return { post, set: (next) => post.setEffectUni(id, uniforms(next, pixelRatio)) }
}
