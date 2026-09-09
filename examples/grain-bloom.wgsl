fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let glow = exp(-dot(p, p) * 2.4);
  let ring = exp(-abs(length(p) - 0.45 + 0.04 * sin(t * 2.0)) * 18.0);
  let ink = vec3f(0.02, 0.02, 0.018);
  let acid = vec3f(0.847, 1.0, 0.243);
  return vec4f(mix(ink, acid, glow * 0.95 + ring * 0.65), 1.0);
}
