fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let r = length(p);
  let a = atan2(p.y, p.x);
  let bands = sin(r * 12.0 - t * 1.4 + sin(a * 4.0 + t * 0.7));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.07 + 0.1 * r);
  color = mix(color, acid, smoothstep(0.15, 0.9, bands * 0.5 + 0.5) * (1.0 - r * 0.5));
  return vec4f(color, 1.0);
}
