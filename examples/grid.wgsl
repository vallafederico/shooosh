fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let cells = 10.0;
  let p = vUv * cells;
  let fx = min(fract(p.x), 1.0 - fract(p.x));
  let fy = min(fract(p.y), 1.0 - fract(p.y));
  let fine = 1.0 - smoothstep(0.0, 0.035, min(fx, fy));
  let majorP = vUv * 2.0;
  let mx = min(fract(majorP.x), 1.0 - fract(majorP.x));
  let my = min(fract(majorP.y), 1.0 - fract(majorP.y));
  let major = 1.0 - smoothstep(0.0, 0.012, min(mx, my));
  let pulse = 0.55 + 0.45 * sin(t * 1.4);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.1);
  color = mix(color, paper, fine * 0.22);
  color = mix(color, acid, major * pulse);
  return vec4f(color, 1.0);
}
