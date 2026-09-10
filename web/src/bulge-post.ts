/** Fullscreen mouse bulge. Post contract: applyEffect, not fsMain. */

export const bulgeEffect = `vec4 applyEffect(vec4 color, vec2 uv, vec2 resolution, vec4 uni[4]) {
  vec2 mouse = uni[0].xy;
  float radius = max(uni[0].z, 1.0);
  vec2 delta = (uv - mouse) * resolution;
  float falloff = exp(-dot(delta, delta) / (radius * radius) * 2.2);
  vec2 warped = (mouse * resolution + delta * (1.0 - 0.34 * falloff)) / resolution;
  return texture(uTexture, clamp(warped, vec2(0.0), vec2(1.0)));
}
`

export const bulgeEffectWgsl = `fn applyEffect(color: vec4f, uv: vec2f, resolution: vec2f, uni: Uni) -> vec4f {
  let mouse = uni.values0.xy;
  let radius = max(uni.values0.z, 1.0);
  let delta = (uv - mouse) * resolution;
  let falloff = exp(-dot(delta, delta) / (radius * radius) * 2.2);
  let warped = (mouse * resolution + delta * (1.0 - 0.34 * falloff)) / resolution;
  return textureSample(uTexture, uSampler, clamp(warped, vec2f(0.0), vec2f(1.0)));
}
`

/** This page uses one post pass: WebGL scene UVs are bottom-origin. */
export function bulgePointerY(mouseY: number, backend: "webgl2" | "webgpu") {
  return backend === "webgl2" ? (1 - mouseY) * 0.5 : (mouseY + 1) * 0.5;
}
