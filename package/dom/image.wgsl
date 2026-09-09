fn fsMain() -> vec4f {
  let uv = fitUv(vUv);
  let color = textureSample(uTexture, uSampler, uv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
  return color;
}