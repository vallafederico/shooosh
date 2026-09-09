fn fsMain() -> vec4f {
  let mode = uUni.values2.x;
  let split = uUni.values2.y;
  let zoom = uUni.values2.z;
  let channel = uUni.values2.w;
  let ratio = uUni.values3.z / uUni.values3.w;
  let fit = vec2f(max(1.0, ratio), max(1.0, 1.0 / ratio));
  let uv = (vUv - vec2f(0.5)) * fit / zoom + vec2f(0.5) + uUni.values3.xy;
  var panel: f32 = 0.0;
  if (vUv.x > split) { panel = 1.0; }
  if (mode > 0.5) { panel = mode - 1.0; }
  let safeUv = clamp(uv, vec2f(0.0005), vec2f(0.9995));
  let sample = textureSample(uTexture, uSampler, vec2f((safeUv.x + panel) / 3.0, safeUv.y));
  let checker = 0.17 + 0.07 * (fract((floor(vUv.x * 48.0) + floor(vUv.y * 32.0)) * 0.5) * 2.0);
  var color: vec3f = mix(vec3f(checker), sample.rgb, sample.a);
  if (channel > 0.5 && channel < 1.5) { color = vec3f(sample.a); }
  if (channel > 1.5 && channel < 2.5) { color = vec3f(sample.r); }
  if (channel > 2.5 && channel < 3.5) { color = vec3f(sample.g); }
  if (channel > 3.5) { color = vec3f(sample.b); }
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { color = vec3f(0.08); }
  if (mode < 0.5 && abs(vUv.x - split) < 0.0015) { color = vec3f(0.74, 0.96, 0.35); }
  return vec4f(color, 1.0);
}
