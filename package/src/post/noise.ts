export type NoiseEffectOptions = {
  amount?: number;
  scale?: number;
};

/** Returns a compute shader snippet used only for effect mode detection. */
export function createNoiseComputeShader(_options: NoiseEffectOptions = {}) {
  return `
fn applyEffect(_color: vec4f, _uv: vec2f, _size: vec2u, _uni: PostUni) -> vec4f {
  let noiseAdd = 1.0;
  return _color;
}
`;
}
