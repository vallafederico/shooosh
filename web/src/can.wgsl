fn fresnel(c: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
}

fn light(n: vec3f, v: vec3f, l: vec3f, radiance: vec3f, albedo: vec3f, metal: f32, rough: f32) -> vec3f {
  let h = normalize(v + l);
  let nl = max(dot(n, l), 0.0);
  let nv = max(dot(n, v), 0.001);
  let nh = max(dot(n, h), 0.0);
  let vh = max(dot(v, h), 0.0);
  let a = rough * rough;
  let a2 = a * a;
  let d = a2 / max(3.14159265 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0), 0.00001);
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  let g = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
  let f = fresnel(vh, mix(vec3f(0.04), albedo, metal));
  return ((vec3f(1.0) - f) * (1.0 - metal) * albedo / 3.14159265 + d * g * f / max(4.0 * nv * nl, 0.0001)) * radiance * nl;
}

fn studio(r: vec3f, rough: f32) -> vec3f {
  let sky = mix(vec3f(0.18, 0.18, 0.2), vec3f(0.72, 0.74, 0.78), clamp(r.y * 0.5 + 0.5, 0.0, 1.0));
  let sharpness = mix(80.0, 4.0, rough);
  let key = pow(max(dot(r, normalize(vec3f(-0.55, 0.85, 0.7))), 0.0), sharpness);
  let fill = pow(max(dot(r, normalize(vec3f(0.8, 0.25, -0.35))), 0.0), sharpness * 0.65);
  return sky + vec3f(4.8, 4.4, 4.0) * key + vec3f(0.55, 0.7, 0.95) * fill;
}

fn fsMain() -> vec4f {
  let base = textureSample(uEnvMap, uSampler, vUv);
  let maps = textureSample(uMaskMap, uSampler, vUv);
  let n = normalize(vNormal);
  let v = normalize(vec3f(0.0, 0.18, 1.0));
  let albedo = pow(max(base.rgb, vec3f(0.0)), vec3f(2.2));
  let rough = clamp(maps.g, 0.08, 1.0);
  let metal = clamp(maps.b, 0.0, 1.0);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let reflected = reflect(-v, n);
  let envF = fresnel(max(dot(n, v), 0.0), f0);
  var color: vec3f = albedo * (1.0 - metal) * (0.16 + 0.22 * max(n.y, 0.0));
  color += studio(reflected, rough) * envF * (1.0 - rough * 0.55);
  color += light(n, v, normalize(vec3f(-0.55, 0.85, 1.05)), vec3f(2.8, 2.5, 2.15), albedo, metal, rough);
  color += light(n, v, normalize(vec3f(0.75, 0.25, -0.45)), vec3f(0.7, 0.95, 1.35), albedo, metal, rough);
  color = clamp((color * (2.51 * color + vec3f(0.03))) / (color * (2.43 * color + vec3f(0.59)) + vec3f(0.14)), vec3f(0.0), vec3f(1.0));
  return vec4f(pow(color, vec3f(0.454545)), 1.0);
}
