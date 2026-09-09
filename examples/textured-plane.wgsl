fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let uv = fitUv(vUv);
  let warp = uv + 0.012 * vec2f(sin(uv.y * 12.0 + t), cos(uv.x * 10.0 - t));
  let sample = textureSample(uTexture, uSampler, warp);
  let ink = vec3f(0.047, 0.047, 0.043);
  let edge = smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  return vec4f(mix(ink, sample.rgb, edge), 1.0);
}
