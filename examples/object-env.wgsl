fn fsMain() -> vec4f {
  let n = normalize(vNormal);
  let uv = n.xy * 0.5 + vec2f(0.5);
  let env = textureSample(uEnvMap, uSampler, uv).rgb;
  let rim = pow(1.0 - clamp(n.z * 0.5 + 0.5, 0.0, 1.0), 1.6);
  let ink = vec3f(0.047, 0.047, 0.043);
  return vec4f(mix(ink, env, 0.85 + rim * 0.15), 1.0);
}
