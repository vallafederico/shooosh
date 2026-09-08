/** Optional fabric sheen lobe. Pure WGSL text: no renderer or initialization. */
export const sheenWgsl = `
fn fabricSheen(n: vec3f, l: vec3f, v: vec3f, roughness: f32) -> vec3f {
  let h = normalize(l + v);
  let nh = max(dot(n, h), 0.0);
  let nl = max(dot(n, l), 0.0);
  let nv = max(dot(n, v), 0.001);
  let invR = 1.0 / max(roughness, 0.12);
  let distribution = (2.0 + invR) * pow(max(1.0 - nh * nh, 0.0001), invR * 0.5) / 6.2831853;
  let visibility = 1.0 / max(4.0 * (nl + nv - nl * nv), 0.001);
  return vec3f(0.48, 0.60, 1.0) * distribution * visibility * nl * 5.0;
}
`
