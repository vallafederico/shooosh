fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let band = uUni.values0.y;
  let p = vUv * 2.0 - 1.0;
  let wave = sin(p.x * 8.0 + t * 1.8 + band * 2.0) * 0.5 + 0.5;
  let stripe = smoothstep(0.35, 0.65, fract(vUv.y * 4.0 + t * 0.15 + band));
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.12 + 0.2 * wave);
  color = mix(color, acid, stripe * 0.55 * (0.4 + 0.6 * wave));
  return vec4f(color, 1.0);
}
