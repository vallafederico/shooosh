// Base-color inspection texture, not a full glTF PBR material.
fn wrapCoordinate(uv: f32, mode: f32) -> f32 {
  if (mode < 0.5) { return clamp(uv, 0.0, 1.0); }
  if (mode > 1.5) { return 1.0 - abs(fract(uv * 0.5) * 2.0 - 1.0); }
  return fract(uv);
}
fn linearChannel(value: f32) -> f32 {
  if (value <= 0.04045) { return value / 12.92; }
  return pow((value + 0.055) / 1.055, 2.4);
}
fn fsMain() -> vec4f {
  let n: vec3f = normalize(vNormal);
  let uv: vec2f = vec2f(wrapCoordinate(vUv.x, uUni.values2.x), wrapCoordinate(vUv.y, uUni.values2.y));
  let texel: vec3f = textureSample(uEnvMap, uSampler, uv).rgb;
  let linear: vec3f = vec3f(linearChannel(texel.r), linearChannel(texel.g), linearChannel(texel.b));
  let base: vec3f = uUni.values0.xyz * mix(vec3f(1.0), linear, uUni.values1.w);
  let metallic: f32 = uUni.values1.x;
  let roughness: f32 = max(uUni.values1.y, 0.04);
  let light: vec3f = normalize(vec3f(-0.4, 0.8, 0.9));
  let diffuse: f32 = max(dot(n, light), 0.0);
  let spec: f32 = pow(max(dot(n, normalize(light + vec3f(0.0, 0.0, 1.0))), 0.0), mix(100.0, 4.0, roughness));
  let rim: f32 = max(dot(n, normalize(vec3f(0.7, 0.3, -0.8))), 0.0);
  let color: vec3f = base * (0.18 + diffuse * (1.0 - metallic * 0.6)) + mix(vec3f(0.08), base, metallic) * spec + base * rim * 0.2;
  let selected: vec3f = mix(color, vec3f(0.65, 0.85, 0.12), uUni.values1.z * 0.3);
  return vec4f(pow(max(selected, vec3f(0.0)), vec3f(0.4545)), 1.0);
}
