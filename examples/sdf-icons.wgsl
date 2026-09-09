fn fsMain() -> vec4f {
  let t = uUni.values0.x;
  let widthPx = max(uUni.values0.y, 1.0);
  let spread = max(uUni.values0.z, 1.0);
  let sample = textureSample(uTexture, uSampler, vUv).r;
  let sd = sample - 0.5;
  let screenPxRange = max(spread * (widthPx / 256.0), 1.0);
  let alpha = clamp(sd * screenPxRange + 0.5, 0.0, 1.0);
  let acid = vec3f(0.847, 1.0, 0.243);
  let paper = vec3f(0.925, 0.906, 0.863);
  let pulse = 0.85 + 0.15 * sin(t * 1.6 + vUv.x * 3.0);
  let fill = mix(acid, paper, vUv.y) * pulse;
  // Premultiplied — createItem blends ONE / ONE_MINUS_SRC_ALPHA.
  return vec4f(fill * alpha, alpha);
}
