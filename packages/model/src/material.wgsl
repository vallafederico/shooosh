// Solid-color inspection material. No claim of full glTF PBR equivalence.
fn fsMain() -> vec4f {
  let n: vec3f = normalize(vNormal);
  let base: vec3f = uUni.values0.xyz;
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
