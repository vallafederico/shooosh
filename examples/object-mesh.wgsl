fn fsMain() -> vec4f {
  let n = normalize(vNormal);
  let light = normalize(vec3f(-0.2, 0.8, 0.5));
  let ndl = clamp(dot(n, light), 0.0, 1.0);
  let ink = vec3f(0.047, 0.047, 0.043);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let color = mix(mix(ink, paper, 0.2), acid, ndl);
  return vec4f(color, 1.0);
}
