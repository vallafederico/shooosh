export type BloomEffectOptions = {
  threshold?: number;
  intensity?: number;
  radius?: number;
};

export function createBloomComputeShader(options: BloomEffectOptions = {}) {
  const threshold = options.threshold ?? 0.72;
  const intensity = options.intensity ?? 0.85;
  const radius = options.radius ?? 1.5;

  return `
fn applyEffect(color: vec4f, uv: vec2f, size: vec2u, _uni: PostUni) -> vec4f {
  let sizeI = vec2i(size);
  let center = vec2i(clamp(vec2u(uv * vec2f(size)), vec2u(0), size - vec2u(1)));
  let maxCoord = sizeI - vec2i(1, 1);
  let r = ${radius};
  let threshold = ${threshold};
  let intensity = ${intensity} * max(0.0, _uni.values0.x);

  let o = i32(round(r));
  let c0 = textureLoad(srcTexture, clamp(center + vec2i(-o, -o), vec2i(0), maxCoord), 0).rgb;
  let c1 = textureLoad(srcTexture, clamp(center + vec2i( 0, -o), vec2i(0), maxCoord), 0).rgb;
  let c2 = textureLoad(srcTexture, clamp(center + vec2i( o, -o), vec2i(0), maxCoord), 0).rgb;
  let c3 = textureLoad(srcTexture, clamp(center + vec2i(-o,  0), vec2i(0), maxCoord), 0).rgb;
  let c4 = textureLoad(srcTexture, center, 0).rgb;
  let c5 = textureLoad(srcTexture, clamp(center + vec2i( o,  0), vec2i(0), maxCoord), 0).rgb;
  let c6 = textureLoad(srcTexture, clamp(center + vec2i(-o,  o), vec2i(0), maxCoord), 0).rgb;
  let c7 = textureLoad(srcTexture, clamp(center + vec2i( 0,  o), vec2i(0), maxCoord), 0).rgb;
  let c8 = textureLoad(srcTexture, clamp(center + vec2i( o,  o), vec2i(0), maxCoord), 0).rgb;

  let blur = (c0 + c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8) / 9.0;
  let bright = max(max(blur.r, blur.g), blur.b);
  let mask = smoothstep(threshold, 1.0, bright);
  let bloom = blur * mask * intensity;
  return vec4f(color.rgb + bloom, color.a);
}
`;
}
