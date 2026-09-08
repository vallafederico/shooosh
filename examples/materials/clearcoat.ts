/** Optional dielectric GGX clearcoat. Pure WGSL text, independently importable. */
export const clearcoatWgsl = `
fn fabricCoat(n: vec3f, l: vec3f, v: vec3f, roughness: f32) -> vec3f {
  let h = normalize(l + v);
  let nl = max(dot(n, l), 0.0);
  let nv = max(dot(n, v), 0.001);
  let nh = max(dot(n, h), 0.0);
  let hv = max(dot(h, v), 0.0);
  let a = max(roughness * roughness, 0.01);
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  let distribution = a2 / max(3.14159265 * d * d, 0.0001);
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let g = nl / max(nl * (1.0 - k) + k, 0.001) * nv / max(nv * (1.0 - k) + k, 0.001);
  let f = 0.04 + 0.96 * pow(1.0 - hv, 5.0);
  return vec3f(1.0) * distribution * g * f * nl / max(4.0 * nl * nv, 0.001);
}
`
