fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let uv = fitUv(vUv);
  let sample = textureSample(uTexture, uSampler, uv);
  let vignette = smoothstep(0.95, 0.35, length(vUv - 0.5));
  let pulse = 0.92 + 0.08 * sin(t * 2.0 + vUv.x * 4.0);
  return vec4f(sample.rgb * vignette * pulse, 1.0);
}
