// Forward flight through a world-space cloud field; bounded volume integration.
fn hash3(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}
fn noise3(p: vec3f) -> f32 {
  let cell: vec3f = floor(p);
  let f: vec3f = fract(p);
  let w: vec3f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(cell), hash3(cell + vec3f(1.0, 0.0, 0.0)), w.x),
    mix(hash3(cell + vec3f(0.0, 1.0, 0.0)), hash3(cell + vec3f(1.0, 1.0, 0.0)), w.x), w.y),
    mix(mix(hash3(cell + vec3f(0.0, 0.0, 1.0)), hash3(cell + vec3f(1.0, 0.0, 1.0)), w.x),
    mix(hash3(cell + vec3f(0.0, 1.0, 1.0)), hash3(cell + vec3f(1.0, 1.0, 1.0)), w.x), w.y), w.z);
}
fn density(p: vec3f) -> f32 {
  let q: vec3f = p * 0.48 + vec3f(uUni.values0.x * 0.045, 0.0, 0.0);
  let n: f32 = noise3(q) * 0.58 + noise3(q * 2.03) * 0.28 + noise3(q * 4.07) * 0.14;
  let layer: f32 = smoothstep(-2.0, 0.0, p.y) * (1.0 - smoothstep(5.0, 7.0, p.y));
  return max(n - 0.54, 0.0) * layer * 7.0;
}
fn fsMain() -> vec4f {
  let uv: vec2f = vec2f((vUv.x - 0.5) * uUni.values0.y, 0.5 - vUv.y);
  let t: f32 = uUni.values0.x;
  // Constant forward travel with gentle lateral/altitude drift; no camera roll.
  let ro: vec3f = vec3f(sin(t * 0.13) * 0.65, 2.7 + sin(t * 0.19) * 0.45, -4.0 + t * 0.9);
  let rd: vec3f = normalize(vec3f(uv.x, uv.y + 0.04, 0.95));
  let sun: vec3f = normalize(vec3f(-0.6, 0.65, 0.5));
  let alignment: f32 = max(dot(rd, sun), 0.0);
  let sky: vec3f = mix(vec3f(0.38, 0.61, 0.85), vec3f(0.035, 0.16, 0.42), clamp(rd.y, 0.0, 1.0))
    + vec3f(1.0, 0.72, 0.40) * pow(alignment, 32.0) * 0.6;
  var radiance: vec3f = vec3f(0.0);
  var transmission: f32 = 1.0;
  // Integrate every view direction, including horizontal/downward rays inside clouds.
  // Quadratic spacing puts more samples near the moving camera.
  let jitter: f32 = hash3(vec3f(vUv * 1733.0, 0.5));
  for (var i: i32 = 0; i < 80; i = i + 1) {
      let nearFraction: f32 = f32(i) / 80.0;
      let farFraction: f32 = f32(i + 1) / 80.0;
      let nearDistance: f32 = nearFraction * nearFraction * 22.0;
      let farDistance: f32 = farFraction * farFraction * 22.0;
      let stride: f32 = farDistance - nearDistance;
      let p: vec3f = ro + rd * (nearDistance + jitter * stride);
      let d: f32 = density(p);
      if (d > 0.001) {
        var opticalDepth: f32 = 0.0;
        for (var j: i32 = 0; j < 4; j = j + 1) {
          opticalDepth = opticalDepth + density(p + sun * (f32(j) + 0.5) * 0.55) * 0.55;
        }
        let direct: f32 = exp(-opticalDepth * 1.8);
        let light: vec3f = vec3f(0.15, 0.22, 0.34) + vec3f(1.0, 0.86, 0.67) * direct * (0.8 + pow(alignment, 8.0));
        let opacity: f32 = 1.0 - exp(-d * stride * 1.5);
        radiance = radiance + transmission * opacity * light;
        transmission = transmission * (1.0 - opacity);
        if (transmission < 0.015) { break; }
      }
  }
  let color: vec3f = radiance + transmission * sky;
  return vec4f(pow(color / (color + vec3f(0.6)), vec3f(0.4545)), 1.0);
}
