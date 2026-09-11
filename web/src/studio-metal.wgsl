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

// Rectangular studio emitters against dark flags. Roughness widens their
// edges and reduces peak energy, rather than adding a uniform gray reflection.
fn softbox(r: vec3f, direction: vec3f, size: vec2f, rough: f32) -> f32 {
  let forward = normalize(direction);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), forward));
  let up = cross(forward, right);
  let facing = dot(r, forward);
  let p = vec2f(dot(r, right), dot(r, up)) / max(facing, 0.001);
  let blur = 0.035 + rough * rough * 1.2;
  let edge = vec2f(1.0) - smoothstep(size - vec2f(blur), size + vec2f(blur), abs(p));
  return edge.x * edge.y * smoothstep(0.0, 0.15, facing) / (1.0 + rough * rough * 3.0);
}

fn studio(r: vec3f, rough: f32) -> vec3f {
  let room = mix(vec3f(0.012, 0.016, 0.022), vec3f(0.055, 0.065, 0.08), clamp(r.y * 0.5 + 0.5, 0.0, 1.0));
  let key = softbox(r, vec3f(-0.75, 0.5, 1.0), vec2f(0.22, 0.85), rough);
  let rim = softbox(r, vec3f(0.85, 0.25, 0.4), vec2f(0.1, 1.2), rough);
  let overhead = softbox(r, vec3f(0.0, 1.0, -0.45), vec2f(0.8, 0.3), rough);
  return room + vec3f(6.0, 5.7, 5.2) * key + vec3f(3.4, 3.8, 4.4) * rim + vec3f(2.0, 2.1, 2.3) * overhead;
}

fn fsMain() -> vec4f {
  let base = textureSample(uEnvMap, uSampler, vUv);
  let maps = textureSample(uMaskMap, uSampler, vUv);
  let n = normalize(vNormal);
  let v = normalize(vec3f(0.0, 0.18, 1.0));
  // value3 selects opaque tinted glass: neutral dielectric reflections over
  // a dark cabin approximation. No metallic response or paint clearcoat.
  let glass: f32 = clamp(uUni.values0.z, 0.0, 1.0);
  let sourceColor = pow(max(base.rgb, vec3f(0.0)), vec3f(2.2));
  let albedo = mix(sourceColor, vec3f(0.004, 0.009, 0.012) * (vec3f(0.6) + sourceColor * 0.4), glass);
  let rough: f32 = mix(clamp(maps.g, 0.08, 1.0), 0.09, glass);
  let metal: f32 = clamp(maps.b, 0.0, 1.0) * (1.0 - glass);
  let f0 = mix(vec3f(0.04), albedo, metal);
  let reflected = reflect(-v, n);
  let envF = fresnel(max(dot(n, v), 0.0), f0);
  var color: vec3f = albedo * (1.0 - metal) * (0.09 + 0.14 * max(n.y, 0.0));
  color += studio(reflected, rough) * envF * (1.0 - rough * 0.55);
  color += light(n, v, normalize(vec3f(-0.55, 0.85, 1.05)), vec3f(1.8, 1.7, 1.5), albedo, metal, rough);
  color += light(n, v, normalize(vec3f(0.75, 0.25, -0.45)), vec3f(0.35, 0.45, 0.65), albedo, metal, rough);
  // Optional dielectric clearcoat: value1 = coverage, value2 = roughness.
  // Keep the base material's roughness; the coat is a separate neutral lobe.
  let coat = clamp(uUni.values0.x, 0.0, 1.0) * (1.0 - glass);
  let coatRough = clamp(uUni.values0.y, 0.08, 1.0);
  let coatF = fresnel(max(dot(n, v), 0.0), vec3f(0.04));
  let transmission = vec3f(1.0) - coat * coatF;
  let coatEnv = studio(reflected, coatRough) * coatF * (1.0 - coatRough * 0.55);
  // Black dielectric has no diffuse contribution, only the coat's GGX lobe.
  let coatKey = light(n, v, normalize(vec3f(-0.55, 0.85, 1.05)), vec3f(1.8, 1.7, 1.5), vec3f(0.0), 0.0, coatRough);
  let coatRim = light(n, v, normalize(vec3f(0.75, 0.25, -0.45)), vec3f(0.35, 0.45, 0.65), vec3f(0.0), 0.0, coatRough);
  color = color * transmission * transmission + coat * (coatEnv + coatKey + coatRim);
  color = clamp((color * (2.51 * color + vec3f(0.03))) / (color * (2.43 * color + vec3f(0.59)) + vec3f(0.14)), vec3f(0.0), vec3f(1.0));
  return vec4f(pow(color, vec3f(0.454545)), 1.0);
}
