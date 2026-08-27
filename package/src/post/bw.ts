export function createBlackAndWhiteComputeShader() {
  return `
fn applyEffect(color: vec4f, _uv: vec2f, _size: vec2u, _uni: PostUni) -> vec4f {
  let luma = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let mixAmount = clamp(_uni.values0.x, 0.0, 1.0);
  return vec4f(mix(color.rgb, vec3f(luma), mixAmount), color.a);
}
`;
}
