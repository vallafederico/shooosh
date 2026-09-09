fn fsMain() -> vec4f {
  let n = normalize(vNormal);
  let lighting = 0.45 + 0.55 * max(dot(n, normalize(vec3f(-0.4, 0.6, 1.0))), 0.0);
  let color = mix(vec3f(0.83, 0.98, 0.28), vec3f(0.48, 0.65, 0.93), uUni.values0.x);
  return vec4f(color * lighting, 1.0);
}