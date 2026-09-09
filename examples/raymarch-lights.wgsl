// Sphere tracing, finite-difference normals, soft visibility and two point lights.
fn distanceScene(p: vec3f) -> f32 {
  let sphere: f32 = length(p - vec3f(-0.85, 0.9, 0.15)) - 0.9;
  let q: vec3f = p - vec3f(0.95, 1.0, 0.4);
  let ring: f32 = length(vec2f(length(q.xy) - 0.72, q.z)) - 0.22;
  return min(p.y, min(sphere, ring));
}
fn normalScene(p: vec3f) -> vec3f {
  let e: f32 = 0.002;
  return normalize(vec3f(
    distanceScene(p + vec3f(e, 0.0, 0.0)) - distanceScene(p - vec3f(e, 0.0, 0.0)),
    distanceScene(p + vec3f(0.0, e, 0.0)) - distanceScene(p - vec3f(0.0, e, 0.0)),
    distanceScene(p + vec3f(0.0, 0.0, e)) - distanceScene(p - vec3f(0.0, 0.0, e))));
}
fn visibility(p: vec3f, direction: vec3f, limit: f32) -> f32 {
  var shade: f32 = 1.0;
  var travel: f32 = 0.025;
  for (var i: i32 = 0; i < 32; i = i + 1) {
    let h: f32 = distanceScene(p + direction * travel);
    if (h < 0.001) { return 0.0; }
    shade = min(shade, 12.0 * h / travel);
    travel = travel + clamp(h, 0.025, 0.35);
    if (travel >= limit) { break; }
  }
  return clamp(shade, 0.0, 1.0);
}
fn illuminate(p: vec3f, n: vec3f, view: vec3f, lamp: vec3f, tint: vec3f, albedo: vec3f) -> vec3f {
  let delta: vec3f = lamp - p;
  let range: f32 = length(delta);
  let l: vec3f = delta / range;
  let diffuse: f32 = max(dot(n, l), 0.0);
  let halfway: vec3f = normalize(l + view);
  let specular: f32 = pow(max(dot(n, halfway), 0.0), 72.0) * 0.9;
  let shadow: f32 = visibility(p + n * 0.008, l, range);
  return (albedo * diffuse + vec3f(specular) * diffuse) * tint * shadow * 7.0 / (1.0 + range * range);
}
fn fsMain() -> vec4f {
  let uv: vec2f = vec2f((vUv.x - 0.5) * uUni.values0.y, 0.5 - vUv.y);
  let ro: vec3f = vec3f(0.0, 2.4, -5.5);
  let forward: vec3f = normalize(vec3f(0.0, 0.85, 0.0) - ro);
  let right: vec3f = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
  let up: vec3f = cross(right, forward);
  let rd: vec3f = normalize(forward * 1.4 + right * uv.x + up * uv.y);
  var travel: f32 = 0.0;
  var hit: bool = false;
  for (var i: i32 = 0; i < 96; i = i + 1) {
    let h: f32 = distanceScene(ro + rd * travel);
    if (h < 0.0015) { hit = true; break; }
    travel = travel + h;
    if (travel > 24.0) { break; }
  }
  var color: vec3f = vec3f(0.012, 0.018, 0.035);
  if (hit) {
    let p: vec3f = ro + rd * travel;
    let n: vec3f = normalScene(p);
    var albedo: vec3f = vec3f(0.52, 0.57, 0.65);
    if (p.y < 0.01) {
      let tile: f32 = 0.5 + 0.5 * sin(p.x * 2.5) * sin(p.z * 2.5);
      albedo = mix(vec3f(0.13), vec3f(0.24), tile);
    }
    var ao: f32 = 1.0;
    for (var j: i32 = 1; j < 5; j = j + 1) {
      let offset: f32 = f32(j) * 0.12;
      ao = ao - max(offset - distanceScene(p + n * offset), 0.0) * 0.45;
    }
    let t: f32 = uUni.values0.x * 0.45;
    let warm: vec3f = vec3f(-2.4 + sin(t) * 1.1, 2.8, -1.5 + cos(t));
    let cool: vec3f = vec3f(2.3, 1.8 + sin(t * 0.7) * 0.6, -0.8);
    color = albedo * vec3f(0.06, 0.08, 0.13) * clamp(ao, 0.0, 1.0)
      + illuminate(p, n, -rd, warm, vec3f(1.0, 0.24, 0.065), albedo)
      + illuminate(p, n, -rd, cool, vec3f(0.08, 0.55, 1.0), albedo);
    color = mix(color, vec3f(0.012, 0.018, 0.035), 1.0 - exp(-travel * travel * 0.002));
  }
  return vec4f(pow(color / (color + vec3f(1.0)), vec3f(0.4545)), 1.0);
}
