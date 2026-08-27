/**
 * Value noise — hash + bilinear interpolate, then a cheap fbm.
 *
 * Site grain / fog / paper texture. value1 = seconds.
 */

import type { ExampleSpec } from "./types"

export const valueNoise: ExampleSpec = {
  id: "value-noise",
  label: "Value noise",
  copy: "Hash21 → value noise → three-octave fbm. The grain / fog / paper field.",
  fragment: `fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  v = v + a * noise(q);
  q = q * 2.02;
  a = a * 0.5;
  v = v + a * noise(q);
  q = q * 2.03;
  a = a * 0.5;
  v = v + a * noise(q);
  return v;
}

fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 4.0 + vec2f(t * 0.08, t * 0.03);
  let n = fbm(p);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let base = mix(ink, paper, n);
  return vec4f(mix(base, acid, smoothstep(0.55, 0.75, n) * 0.55), 1.0);
}
`,
}
