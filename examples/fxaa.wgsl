fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let p = vUv * 2.0 - 1.0;
  let r = length(p);
  let spokes = abs(sin((p.x * 9.0 + p.y * 7.0) + t * 2.5));
  let ripples = abs(sin(r * 36.0 - t * 3.5));
  let hard = max(step(0.94, spokes), step(0.96, ripples));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  return vec4f(mix(paper, mix(ink, acid, hard), hard), 1.0);
}
