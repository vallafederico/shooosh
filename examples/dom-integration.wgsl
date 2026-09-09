fn fsMain() -> vec4f {
  let uv = fitUv(vUv);
  let color = textureSample(uTexture, uSampler, uv);
  let luminance: f32 = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let ink = vec3f(0.24, 0.29, 0.19);
  let paper = vec3f(0.95, 0.93, 0.75);
  let tone = mix(ink, paper, luminance);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
  return vec4f(mix(color.rgb, tone * color.a, uUni.values0.x), color.a);
}