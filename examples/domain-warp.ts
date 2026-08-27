/**
 * Domain warp — noise the sample position, then color by the warped UV.
 *
 * Liquid / oil / marble backgrounds. value1 = seconds.
 */

import type { ExampleSpec } from "./types"

export const domainWarp: ExampleSpec = {
  id: "domain-warp",
  label: "Domain warp",
  copy: "Offset UVs with value noise, then color the warped space. Liquid / marble heroes.",
  fragment: `fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x),
    mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x),
    u.y
  );
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  var p = vUv * 3.0;
  p = p + vec2f(noise(p + vec2f(t * 0.15, 0.0)), noise(p + vec2f(4.0, t * 0.12))) * 1.15;
  let n = noise(p);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let bands = sin(n * 12.0 + t);
  var color = mix(ink, paper, n);
  color = mix(color, acid, smoothstep(0.15, 0.85, bands * 0.5 + 0.5) * 0.7);
  return vec4f(color, 1.0);
}
`,
}
