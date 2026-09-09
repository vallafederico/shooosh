
fn fsMain() -> vec4f {
  let rough = clamp(uUni.values0.x, 0.12, 1.0);
  let detail = uUni.values1.x;
  let angle = uUni.values1.y;
  let original: vec3f = normalize(vNormal);
  var axis: vec3f = vec3f(0.0, 1.0, 0.0);
  if (abs(original.y) > 0.95) { axis = vec3f(1.0, 0.0, 0.0); }
  let tangent: vec3f = normalize(cross(axis, original));
  let bitangent: vec3f = cross(original, tangent);
  let footprint = length(fwidth(vUv));
  let weaveFade = 1.0 - smoothstep(0.004, 0.014, footprint);
  let weave: vec2f = sin(vUv * 300.0) * detail * weaveFade * 0.12;
  let n: vec3f = normalize(original + tangent * weave.x + bitangent * weave.y);
  let l: vec3f = normalize(vec3f(sin(angle), 0.55, cos(angle)));
  let v: vec3f = normalize(vec3f(0.0, 0.2, 1.0));
  let albedo = vec3f(0.66, 0.19, 0.07);
  let base: vec3f = albedo * (0.13 + max(dot(n, l), 0.0) * 1.7);
  let lit: vec3f = base;
  let mapped: vec3f = lit / (vec3f(1.0) + lit);
  return vec4f(pow(mapped, vec3f(0.45454545)), 1.0);
}
