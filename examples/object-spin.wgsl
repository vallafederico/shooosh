fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let n = normalize(vNormal);
  let light = normalize(vec3f(0.4, 0.7, 0.55));
  let ndl = clamp(dot(n, light), 0.0, 1.0);
  let rim = pow(1.0 - clamp(dot(n, vec3f(0.0, 0.0, 1.0)), 0.0, 1.0), 2.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  var color = mix(ink, paper, 0.15 + ndl * 0.55);
  color = mix(color, acid, rim * 0.65 + 0.08 * sin(t + n.x * 4.0));
  return vec4f(color, 1.0);
}
